"""
Map Game -- Monte Carlo run simulator v3
Models the Overcharged curse system: tools only cost time when cursed.
Produces a PDF report with timer pressure analysis across all modes/difficulties.
"""

import random, math, statistics
from fpdf import FPDF

random.seed(42)

# ============================================================
# GAME CONFIG
# ============================================================

MODE_RADIUS_M  = {'short': 500,  'medium': 1000, 'long': 1500}
MODE_TIMER_S   = {'short': 1800, 'medium': 2700, 'long': 3600}
DIFF_HEAT_MULT = {'easy': 0.75, 'normal': 1.0, 'hard': 1.5}

# Tier curse trigger chance by heat level (existing system)
CURSE_TRIGGER  = {1: 0.20, 2: 0.40, 3: 0.65, 4: 0.90, 5: 1.00}
CURSE_SURCHARGE= {1: 0.25, 2: 0.50}  # heat surcharge for heat1/heat2 curses
CURSE_DUR_S    = 300  # 5 min for tier curses

# Overcharged curse (new)
OVERCHARGED_CHANCE = {0: 0, 1: 0, 2: 0.10, 3: 0.25, 4: 0.45, 5: 0.65}
OVERCHARGED_DUR_S  = 240   # 4 min per application
OVERCHARGED_COST_S = 90    # seconds per tool use per stack
OVERCHARGED_MAX_STACKS = 3

# Difficulty scaling for curse probabilities
DIFF_CURSE_MULT = {'easy': 0.75, 'normal': 1.0, 'hard': 1.5}

# ============================================================
# TOOL COSTS (current live values after v3 rebalance)
# ============================================================

RADAR = {
    'short':  [(50,.2),(100,.3),(150,.4),(250,.4),(350,.6),(400,.6)],
    'medium': [(50,.2),(100,.3),(250,.4),(400,.6),(650,.8),(800,.8)],
    'long':   [(50,.2),(100,.3),(250,.4),(500,.6),(900,.8),(1200,1.0)],
}
THERMO = {
    'short':  [(100,.4),(140,.3),(180,.2)],
    'medium': [(150,.4),(220,.3),(300,.2)],
    'long':   [(200,.4),(350,.3),(500,.2)],
}
COSTS = dict(nsew=0.5, landmark=0.4,
             near200=1.0, near100=1.2, horizon=0.8, uncorrupt=0.6)

# Score config
SCORE_TIME_BONUS_MAX = 300

# ============================================================
# LIVERPOOL GEOGRAPHY
# ============================================================

WALK_MULT = {'short': 1.90, 'medium': 1.80, 'long': 1.70}
WALK_STD  = 0.30
EFFECTIVE_RADIUS_FRAC = {'short': 1.00, 'medium': 0.95, 'long': 0.88}

# ============================================================
# PLAYER BEHAVIOUR
# ============================================================

TOOLS_DIST = {
    ('short','easy'):   (2.5,1.2), ('short','normal'):  (3.0,1.4), ('short','hard'):   (2.0,1.0),
    ('medium','easy'):  (3.5,1.5), ('medium','normal'): (4.0,1.5), ('medium','hard'):  (2.5,1.2),
    ('long','easy'):    (4.5,1.8), ('long','normal'):   (5.0,1.8), ('long','hard'):    (3.0,1.4),
}
TOOL_MIX = {
    'short':  {'radar':.45,'thermo':.20,'nsew':.15,'landmark':.10,'photo':.10},
    'medium': {'radar':.40,'thermo':.15,'nsew':.20,'landmark':.15,'photo':.10},
    'long':   {'radar':.35,'thermo':.15,'nsew':.20,'landmark':.20,'photo':.10},
}
RADAR_PREF = {
    'short':  [.05,.15,.35,.30,.10,.05],
    'medium': [.05,.10,.35,.35,.10,.05],
    'long':   [.03,.07,.30,.40,.15,.05],
}
LOCK_FRAC = {
    ('short','easy'):.50, ('short','normal'):.60, ('short','hard'):.65,
    ('medium','easy'):.55,('medium','normal'):.65,('medium','hard'):.72,
    ('long','easy'):.60,  ('long','normal'):.68,  ('long','hard'):.78,
}

# ============================================================
# HELPERS
# ============================================================

def wc(items, weights):
    r=random.random(); s=0
    for it,w in zip(items,weights):
        s+=w
        if r<=s: return it
    return items[-1]

def pct(data,p):
    sd=sorted(data); idx=p/100*(len(sd)-1)
    lo=int(idx); hi=min(lo+1,len(sd)-1)
    return sd[lo]+(idx-lo)*(sd[hi]-sd[lo])

def heat_tier(h): return min(5,max(0,int(math.floor(h))))

# ============================================================
# SINGLE RUN
# ============================================================

def sim_run(mode, diff):
    radius    = MODE_RADIUS_M[mode] * EFFECTIVE_RADIUS_FRAC[mode]
    timer_s   = MODE_TIMER_S[mode]
    hmult     = DIFF_HEAT_MULT[diff]
    cmult     = DIFF_CURSE_MULT[diff]

    target_m  = radius * math.sqrt(random.random())
    walk_m    = max(target_m*0.8,
                    random.gauss(target_m*WALK_MULT[mode],
                                 target_m*WALK_MULT[mode]*WALK_STD))

    lock_frac = min(1.0, max(0.1, random.gauss(LOCK_FRAC[(mode,diff)], 0.12)))
    time_s    = lock_frac * timer_s

    mu,sd_t   = TOOLS_DIST[(mode,diff)]
    n_tools   = max(0,min(12,int(round(random.gauss(mu,sd_t)))))

    mix = dict(TOOL_MIX[mode])
    if diff=='hard':
        extra=mix.pop('photo',0)
        mix['radar']=mix.get('radar',0)+extra*0.7
        mix['landmark']=mix.get('landmark',0)+extra*0.3
    tw=sum(mix.values()); mix={k:v/tw for k,v in mix.items()}

    rpref=list(RADAR_PREF[mode])
    if diff=='hard':
        rpref=[w*(1.6-i*0.25) for i,w in enumerate(rpref)]
        t=sum(rpref); rpref=[w/t for w in rpref]

    heat=0.0; tools_used=0; penalty_s=0.0
    curse_surcharge=0.0; curse_end_s=-1
    curses_fired={1:0,2:0,3:0,4:0,5:0}

    # Overcharged state
    oc_stacks=0; oc_end_s=-1
    oc_triggers=0; oc_max_stacks_reached=0
    time_lost_to_oc=0.0

    nsew_unlock_s=timer_s*0.5
    used_radar=set(); used_thermo=set(); used_nsew=set()
    used_landmark=set(); used_photo=set()

    for attempt in range(n_tools):
        cur_t=(attempt/max(1,n_tools))*time_s

        # Expire tier curses
        if cur_t>curse_end_s: curse_surcharge=0.0

        # Expire overcharged
        if cur_t>oc_end_s: oc_stacks=0

        # Check if player is out of time (timer - penalty)
        effective_remaining = timer_s - cur_t - penalty_s
        if effective_remaining <= 0:
            break  # timed out

        # Player awareness: if cursed with high penalty, they may stop using tools
        if oc_stacks > 0 and effective_remaining < 180:
            if random.random() < 0.7:  # 70% chance they stop
                break

        avail=dict(mix)
        if cur_t<nsew_unlock_s:              avail.pop('nsew',None)
        if len(used_radar)>=len(RADAR[mode]):avail.pop('radar',None)
        if len(used_thermo)>=len(THERMO[mode]):avail.pop('thermo',None)
        if len(used_nsew)>=2:                avail.pop('nsew',None)
        if len(used_landmark)>=5:            avail.pop('landmark',None)
        if len(used_photo)>=3 or (diff=='hard' and len(used_photo)>=1):
            avail.pop('photo',None)
        if not avail: break

        tw=sum(avail.values())
        tool=wc(list(avail.keys()),[v/tw for v in avail.values()])

        base=0.0
        if tool=='radar':
            free=[i for i in range(len(RADAR[mode])) if i not in used_radar]
            if not free: continue
            fw=[rpref[i] for i in free]; ft=sum(fw)
            ci=wc(free,[w/ft for w in fw])
            _,base=RADAR[mode][ci]; used_radar.add(ci)
        elif tool=='thermo':
            free=[i for i in range(len(THERMO[mode])) if i not in used_thermo]
            if not free: continue
            ci=random.choice(free)
            _,base=THERMO[mode][ci]; used_thermo.add(ci)
        elif tool=='nsew':
            axes=[a for a in('NS','EW') if a not in used_nsew]
            if not axes: continue
            used_nsew.add(random.choice(axes)); base=COSTS['nsew']
        elif tool=='landmark':
            types=[t for t in('train_station','cathedral','bus_station','library','museum')
                   if t not in used_landmark]
            if not types: continue
            used_landmark.add(random.choice(types)); base=COSTS['landmark']
        elif tool=='photo':
            opts=[k for k in('near200','horizon','uncorrupt') if k not in used_photo]
            if not opts: continue
            ch=random.choice(opts); used_photo.add(ch); base=COSTS[ch]

        actual=base*hmult+curse_surcharge

        proj=heat+actual
        if proj>=5.0 and diff in('normal','hard') and random.random()<0.55: break
        if proj>=4.5 and diff=='hard'             and random.random()<0.45: break

        old_tier=heat_tier(heat)
        heat=proj; new_tier=heat_tier(heat)
        tools_used+=1

        # Apply time penalty if overcharged is active
        if oc_stacks > 0:
            cost = oc_stacks * OVERCHARGED_COST_S
            penalty_s += cost
            time_lost_to_oc += cost

        # Tier curse roll
        for tier in range(old_tier+1,min(new_tier+1,6)):
            p_tier = min(1.0, CURSE_TRIGGER.get(tier,0) * cmult)
            if random.random() < p_tier:
                curses_fired[tier]+=1
                s=CURSE_SURCHARGE.get(tier,0)
                if s>0:
                    curse_surcharge=max(curse_surcharge,s)
                    curse_end_s=cur_t+CURSE_DUR_S

        # Overcharged curse roll (independent, based on current heat level)
        oc_level = heat_tier(heat)
        if oc_level >= 2:
            p_oc = min(1.0, OVERCHARGED_CHANCE.get(oc_level, 0) * cmult)
            if p_oc > 0 and random.random() < p_oc:
                oc_triggers += 1
                if oc_stacks == 0:
                    oc_stacks = 1
                    oc_end_s = cur_t + OVERCHARGED_DUR_S
                elif oc_stacks < OVERCHARGED_MAX_STACKS:
                    oc_stacks += 1
                    oc_end_s = max(oc_end_s, cur_t) + OVERCHARGED_DUR_S
                else:
                    oc_end_s = cur_t + OVERCHARGED_DUR_S  # refresh only
                oc_max_stacks_reached = max(oc_max_stacks_reached, oc_stacks)

    heat=min(heat,5.0)

    # Compute effective remaining time at lock-in
    remaining_s = max(0, timer_s - time_s - penalty_s)
    timed_out = remaining_s <= 0

    # Time bonus: proportion of time remaining * max bonus
    time_bonus = (remaining_s / timer_s) * SCORE_TIME_BONUS_MAX if not timed_out else 0

    return dict(
        target_m=target_m, walk_m=walk_m, tools_used=tools_used,
        heat_final=heat, lock_frac=lock_frac,
        curses_fired=curses_fired, tier_reached=heat_tier(heat),
        penalty_s=penalty_s, remaining_s=remaining_s,
        timed_out=timed_out, time_bonus=time_bonus,
        oc_triggers=oc_triggers, oc_max_stacks=oc_max_stacks_reached,
        time_lost_to_oc=time_lost_to_oc,
    )

# ============================================================
# RUN SIMULATIONS
# ============================================================

N=50000
MODES=['short','medium','long']
DIFFS=['easy','normal','hard']

print(f"Running {N} iterations x {len(MODES)*len(DIFFS)} combos = {N*len(MODES)*len(DIFFS):,} total simulations...")

results={}
for mode in MODES:
    for diff in DIFFS:
        k=(mode,diff)
        results[k]=[sim_run(mode,diff) for _ in range(N)]
        print(f"  {mode}/{diff} done")

def summarise(runs):
    n=len(runs)
    walk  =[r['walk_m']       for r in runs]
    tools =[r['tools_used']   for r in runs]
    heat  =[r['heat_final']   for r in runs]
    frac  =[r['lock_frac']    for r in runs]
    tiers =[r['tier_reached'] for r in runs]
    pen   =[r['penalty_s']    for r in runs]
    rem   =[r['remaining_s']  for r in runs]
    tbo   =[r['time_bonus']   for r in runs]
    tloc  =[r['time_lost_to_oc'] for r in runs]
    oc_tr =[r['oc_triggers']  for r in runs]
    oc_ms =[r['oc_max_stacks']for r in runs]

    total_curses={t:sum(r['curses_fired'][t] for r in runs)/n for t in range(1,6)}

    # Timer pressure metrics
    timed_out_frac = sum(1 for r in runs if r['timed_out'])/n
    lt5m_frac = sum(1 for r in runs if r['remaining_s'] < 300)/n
    lt10m_frac= sum(1 for r in runs if r['remaining_s'] < 600)/n
    got_oc_frac = sum(1 for r in runs if r['oc_triggers'] > 0)/n
    got_oc2_frac= sum(1 for r in runs if r['oc_max_stacks'] >= 2)/n
    got_oc3_frac= sum(1 for r in runs if r['oc_max_stacks'] >= 3)/n

    return dict(
        walk_mean=statistics.mean(walk), walk_med=statistics.median(walk),
        tools_mean=statistics.mean(tools), tools_med=statistics.median(tools),
        tools_p25=pct(tools,25), tools_p75=pct(tools,75),
        heat_mean=statistics.mean(heat), heat_med=statistics.median(heat),
        heat_p25=pct(heat,25), heat_p75=pct(heat,75),
        lock_frac_mean=statistics.mean(frac),
        tier_dist={t:sum(1 for x in tiers if x==t)/n for t in range(6)},
        tier_ge={t:sum(1 for x in tiers if x>=t)/n for t in range(1,6)},
        curses_per_run=total_curses,
        total_curses=sum(total_curses.values()),
        # Timer pressure
        penalty_mean=statistics.mean(pen), penalty_med=statistics.median(pen),
        penalty_p75=pct(pen,75), penalty_p95=pct(pen,95),
        remaining_mean=statistics.mean(rem), remaining_med=statistics.median(rem),
        remaining_p25=pct(rem,25), remaining_p10=pct(rem,10),
        timed_out_frac=timed_out_frac,
        lt5m_frac=lt5m_frac, lt10m_frac=lt10m_frac,
        time_bonus_mean=statistics.mean(tbo),
        time_lost_oc_mean=statistics.mean(tloc),
        got_oc_frac=got_oc_frac,
        got_oc2_frac=got_oc2_frac,
        got_oc3_frac=got_oc3_frac,
    )

summary={k:summarise(v) for k,v in results.items()}

# ============================================================
# PDF REPORT
# ============================================================

BG=(8,12,20); SURF=(15,23,42); CARD=(22,35,58); BORDER=(42,63,96)
TEXT=(225,235,245); MUTED=(100,130,165); ACCENT=(80,170,255)
GREEN=(80,200,130); ORANGE=(220,140,60); RED_C=(220,80,80)
PURPLE=(168,85,247)
MODE_C={'short':(80,200,130),'medium':(80,170,255),'long':(200,100,255)}
DIFF_C={'easy':(80,200,130),'normal':(80,170,255),'hard':(220,80,80)}

class PDF(FPDF):
    def header(self):
        self.set_fill_color(*BG); self.rect(0,0,210,297,'F')
    def footer(self):
        self.set_y(-12)
        self.set_font('Helvetica','I',7)
        self.set_text_color(*MUTED)
        self.cell(0,6,f'Map Game -- V3 Overcharged Curse Simulation  *  Liverpool / Lime Street  *  {N:,} iterations per combination  *  Page {self.page_no()}',align='C')

pdf=PDF('P','mm','A4')
pdf.set_auto_page_break(auto=True,margin=15)
pdf.add_page()

# ---- Cover ----
pdf.set_fill_color(*SURF); pdf.rect(10,10,190,55,'F')
pdf.set_draw_color(*BORDER); pdf.set_line_width(0.4); pdf.rect(10,10,190,55)

pdf.set_xy(14,16); pdf.set_font('Helvetica','B',19)
pdf.set_text_color(*TEXT); pdf.cell(0,8,'V3 Timer Pressure Simulation',ln=True)

pdf.set_x(14); pdf.set_font('Helvetica','',10); pdf.set_text_color(*MUTED)
pdf.cell(0,5,'Liverpool City Centre  *  Player starts at Lime Street Station (53.4074, -2.9779)',ln=True)
pdf.set_x(14); pdf.cell(0,5,f'{N:,} iterations per combination  *  Overcharged curse system',ln=True)
pdf.set_x(14); pdf.set_font('Helvetica','I',9); pdf.set_text_color(PURPLE[0],PURPLE[1],PURPLE[2])
pdf.cell(0,5,'Tools cost time ONLY when cursed with Overcharged  *  90s x stacks per tool use  *  Stacks up to 3x',ln=True)
pdf.set_x(14); pdf.set_text_color(*MUTED); pdf.set_font('Helvetica','',8)
pdf.cell(0,5,f'Trigger chance by heat: lv2={OVERCHARGED_CHANCE[2]*100:.0f}%, lv3={OVERCHARGED_CHANCE[3]*100:.0f}%, lv4={OVERCHARGED_CHANCE[4]*100:.0f}%, lv5={OVERCHARGED_CHANCE[5]*100:.0f}%  *  Duration: {OVERCHARGED_DUR_S}s/stack  *  Diff scaling: easy x0.75, hard x1.5',ln=True)

pdf.ln(5)

# ---- Helper functions ----
def section_hdr(title, r,g,b):
    y=pdf.get_y()
    if y > 270: pdf.add_page(); y=pdf.get_y()
    pdf.set_fill_color(r//5,g//5,b//5); pdf.rect(10,y,190,8,'F')
    pdf.set_draw_color(r,g,b); pdf.set_line_width(0.5); pdf.line(10,y,10,y+8)
    pdf.set_xy(13,y+1); pdf.set_font('Helvetica','B',10)
    pdf.set_text_color(r,g,b); pdf.cell(0,6,title); pdf.ln(9)

ROW_H=5
PCOLS=[13,65,105,145]
cw=[50,36,36,36]

def col_hdr():
    y=pdf.get_y()
    pdf.set_fill_color(*SURF); pdf.rect(10,y,190,5,'F')
    pdf.set_font('Helvetica','B',7.5); pdf.set_text_color(*MUTED)
    pdf.set_xy(PCOLS[0],y); pdf.cell(cw[0],5,'METRIC')
    for ci,d in enumerate(DIFFS):
        dr,dg,db=DIFF_C[d]
        pdf.set_xy(PCOLS[ci+1],y); pdf.set_text_color(dr,dg,db)
        pdf.cell(cw[ci+1],5,d.upper(),align='C')
    pdf.ln(5)

def data_row(label, vals, fmt_fn, alt=False, bold=False):
    y=pdf.get_y()
    if y > 278: pdf.add_page(); y=pdf.get_y()
    if alt: pdf.set_fill_color(*CARD); pdf.rect(10,y,190,ROW_H+1,'F')
    pdf.set_font('Helvetica','B' if bold else '',7.5); pdf.set_text_color(*MUTED)
    pdf.set_xy(PCOLS[0],y); pdf.cell(cw[0],ROW_H+1,label)
    colors=[DIFF_C['easy'],DIFF_C['normal'],DIFF_C['hard']]
    for ci,v in enumerate(vals):
        pdf.set_xy(PCOLS[ci+1],y)
        pdf.set_text_color(*colors[ci])
        pdf.set_font('Helvetica','B' if bold else '',7.5)
        pdf.cell(cw[ci+1],ROW_H+1,fmt_fn(v),align='C')
    pdf.ln(ROW_H+1)

def color_row(label, vals, fmt_fn, thresh_fn, alt=False):
    y=pdf.get_y()
    if y > 278: pdf.add_page(); y=pdf.get_y()
    if alt: pdf.set_fill_color(*CARD); pdf.rect(10,y,190,ROW_H+1,'F')
    pdf.set_font('Helvetica','',7.5); pdf.set_text_color(*MUTED)
    pdf.set_xy(PCOLS[0],y); pdf.cell(cw[0],ROW_H+1,label)
    for ci,v in enumerate(vals):
        pdf.set_xy(PCOLS[ci+1],y)
        pdf.set_font('Helvetica','B',7.5)
        pdf.set_text_color(*thresh_fn(v))
        pdf.cell(cw[ci+1],ROW_H+1,fmt_fn(v),align='C')
    pdf.ln(ROW_H+1)

def timer_color(v):
    if v > 0.30: return RED_C
    if v > 0.15: return ORANGE
    return GREEN

def oc_color(v):
    if v > 0.40: return RED_C
    if v > 0.20: return ORANGE
    return GREEN

# ---- Per-mode pages ----
for mode in MODES:
    mr,mg,mb=MODE_C[mode]
    section_hdr(f'{mode.upper()} MODE  --  radius {MODE_RADIUS_M[mode]}m, timer {MODE_TIMER_S[mode]//60}min',mr,mg,mb)

    def s(d): return summary[(mode,d)]

    # Core metrics
    col_hdr()
    data_row('Tools used (mean)',    [s(d)['tools_mean'] for d in DIFFS], lambda v:f'{v:.2f}')
    data_row('Heat final (mean)',    [s(d)['heat_mean'] for d in DIFFS], lambda v:f'{v:.2f}', alt=True)
    data_row('Heat final (median)',  [s(d)['heat_med'] for d in DIFFS], lambda v:f'{v:.2f}')
    data_row('Time used (% timer)', [s(d)['lock_frac_mean'] for d in DIFFS], lambda v:f'{v*100:.1f}%', alt=True)
    data_row('Tier curses/run',     [s(d)['total_curses'] for d in DIFFS], lambda v:f'{v:.2f}')
    pdf.ln(2)

    # TIMER PRESSURE (key section)
    y=pdf.get_y()
    pdf.set_fill_color(PURPLE[0]//5,PURPLE[1]//5,PURPLE[2]//5)
    pdf.rect(10,y,190,6,'F')
    pdf.set_draw_color(*PURPLE); pdf.set_line_width(0.5); pdf.line(10,y,10,y+6)
    pdf.set_xy(13,y+1); pdf.set_font('Helvetica','B',9)
    pdf.set_text_color(*PURPLE); pdf.cell(0,4,'TIMER PRESSURE (Overcharged curse impact)'); pdf.ln(7)

    col_hdr()
    color_row('Got Overcharged (% runs)',  [s(d)['got_oc_frac'] for d in DIFFS],
              lambda v:f'{v*100:.1f}%', oc_color)
    color_row('Reached 2+ stacks',        [s(d)['got_oc2_frac'] for d in DIFFS],
              lambda v:f'{v*100:.1f}%', oc_color, alt=True)
    color_row('Reached 3 stacks (max)',   [s(d)['got_oc3_frac'] for d in DIFFS],
              lambda v:f'{v*100:.1f}%', oc_color)

    data_row('Time lost to OC (mean s)', [s(d)['time_lost_oc_mean'] for d in DIFFS],
             lambda v:f'{v:.0f}s', alt=True)
    data_row('Penalty total (mean s)',   [s(d)['penalty_mean'] for d in DIFFS],
             lambda v:f'{v:.0f}s')
    data_row('Penalty total (median s)', [s(d)['penalty_med'] for d in DIFFS],
             lambda v:f'{v:.0f}s', alt=True)
    data_row('Penalty P95 (s)',          [s(d)['penalty_p95'] for d in DIFFS],
             lambda v:f'{v:.0f}s')

    pdf.ln(1)
    color_row('Remaining < 10 min',      [s(d)['lt10m_frac'] for d in DIFFS],
              lambda v:f'{v*100:.1f}%', timer_color, alt=True)
    color_row('Remaining < 5 min',       [s(d)['lt5m_frac'] for d in DIFFS],
              lambda v:f'{v*100:.1f}%', timer_color)
    color_row('TIMED OUT (0 remaining)', [s(d)['timed_out_frac'] for d in DIFFS],
              lambda v:f'{v*100:.1f}%', timer_color, alt=True)

    data_row('Remaining (mean)',         [s(d)['remaining_mean'] for d in DIFFS],
             lambda v:f'{v/60:.1f}m')
    data_row('Remaining (median)',       [s(d)['remaining_med'] for d in DIFFS],
             lambda v:f'{v/60:.1f}m', alt=True)
    data_row('Remaining P10',            [s(d)['remaining_p10'] for d in DIFFS],
             lambda v:f'{v/60:.1f}m')
    data_row('Time bonus (mean)',        [s(d)['time_bonus_mean'] for d in DIFFS],
             lambda v:f'{v:.0f}', alt=True)
    pdf.ln(2)

    # Heat tier distribution
    y=pdf.get_y()
    if y > 260: pdf.add_page(); y=pdf.get_y()
    pdf.set_fill_color(*SURF); pdf.rect(10,y,190,5,'F')
    pdf.set_font('Helvetica','B',7.5); pdf.set_text_color(*MUTED)
    pdf.set_xy(13,y+0.5); pdf.cell(0,4,'HEAT TIER DISTRIBUTION')
    pdf.ln(5)

    col_hdr()
    tier_labels=['Tier 0 (<1.0)','Tier 1 (1-2)','Tier 2 (2-3)',
                 'Tier 3 (3-4)','Tier 4 (4-5)','Tier 5 (=5.0)']
    for t in range(6):
        color_row(tier_labels[t],
                  [s(d)['tier_dist'][t] for d in DIFFS],
                  lambda v:f'{v*100:.1f}%',
                  lambda v: RED_C if v>0.25 else (ORANGE if v>0.10 else GREEN),
                  alt=(t%2==1))
    pdf.ln(4)

# ---- Summary page ----
pdf.add_page()
section_hdr('SUMMARY: Timer Pressure Across All Modes',*ACCENT)

# Big overview table
hdrs=['Mode/Diff','Got OC','<5min','Timed out','Penalty mean','Remaining mean','Time bonus']
cws =[28,22,22,22,28,28,25]
cxs =[13,42,65,88,112,141,170]

pdf.set_font('Helvetica','B',7.5); pdf.set_text_color(*MUTED)
for i,(h,w) in enumerate(zip(hdrs,cws)):
    pdf.set_xy(cxs[i],pdf.get_y()); pdf.cell(w,5,h)
pdf.ln(6)

ri=0
for mode in MODES:
    for diff in DIFFS:
        s2=summary[(mode,diff)]
        mr,mg,mb=MODE_C[mode]; dr,dg,db=DIFF_C[diff]
        y=pdf.get_y()
        if ri%2==1: pdf.set_fill_color(*CARD); pdf.rect(10,y,190,6,'F')

        pdf.set_font('Helvetica','B',7.5)
        pdf.set_xy(cxs[0],y); pdf.set_text_color(mr,mg,mb)
        pdf.cell(cws[0],6,f'{mode}/{diff}')

        def cv(v,t): return RED_C if v>t[1] else (ORANGE if v>t[0] else GREEN)

        vals=[
            (f'{s2["got_oc_frac"]*100:.1f}%', cv(s2['got_oc_frac'],(0.20,0.40))),
            (f'{s2["lt5m_frac"]*100:.1f}%',   cv(s2['lt5m_frac'],(0.15,0.30))),
            (f'{s2["timed_out_frac"]*100:.1f}%', cv(s2['timed_out_frac'],(0.05,0.15))),
            (f'{s2["penalty_mean"]:.0f}s',     (dr,dg,db)),
            (f'{s2["remaining_mean"]/60:.1f}m',(dr,dg,db)),
            (f'{s2["time_bonus_mean"]:.0f}',   (dr,dg,db)),
        ]
        for ci,(txt,clr) in enumerate(vals):
            pdf.set_xy(cxs[ci+1],y)
            pdf.set_text_color(*clr)
            pdf.set_font('Helvetica','B' if ci<3 else '',7.5)
            pdf.cell(cws[ci+1],6,txt,align='C')
        pdf.ln(6)
        ri+=1

pdf.ln(5)

# Implications
def impl(hd,body):
    y=pdf.get_y()
    if y > 265: pdf.add_page()
    pdf.set_font('Helvetica','B',9); pdf.set_text_color(*TEXT)
    pdf.set_x(13); pdf.cell(0,4,hd,ln=True)
    pdf.set_x(13); pdf.set_font('Helvetica','',8); pdf.set_text_color(*MUTED)
    pdf.multi_cell(184,4,body); pdf.ln(2)

pdf.set_font('Helvetica','B',10); pdf.set_text_color(*ACCENT)
pdf.cell(0,5,'Design Assessment',ln=True); pdf.ln(2)

sn=summary[('short','normal')]
mn=summary[('medium','normal')]
ln2=summary[('long','normal')]
sh=summary[('short','hard')]
mh=summary[('medium','hard')]
lh=summary[('long','hard')]

impl('Curse frequency creates differentiation',
    f'Overcharged triggers in {sn["got_oc_frac"]*100:.1f}% of short/normal runs, '
    f'{mn["got_oc_frac"]*100:.1f}% of medium/normal, and {ln2["got_oc_frac"]*100:.1f}% of long/normal. '
    f'Hard mode increases this: short/hard {sh["got_oc_frac"]*100:.1f}%, medium/hard {mh["got_oc_frac"]*100:.1f}%, '
    f'long/hard {lh["got_oc_frac"]*100:.1f}%. The curse is rare enough that uncursed runs feel relaxed, but '
    f'common enough at high heat to create memorable pressure moments.')

impl('Timer pressure when cursed',
    f'Mean penalty when overcharged fires: short/normal {sn["penalty_mean"]:.0f}s, '
    f'medium/normal {mn["penalty_mean"]:.0f}s, long/normal {ln2["penalty_mean"]:.0f}s. '
    f'P95 penalties: short/normal {summary[("short","normal")]["penalty_p95"]:.0f}s, '
    f'long/normal {summary[("long","normal")]["penalty_p95"]:.0f}s. '
    f'Runs with <5 min remaining: short/normal {sn["lt5m_frac"]*100:.1f}%, long/hard {lh["lt5m_frac"]*100:.1f}%. '
    f'The curse creates genuine time crunch without making every run a race.')

impl('Timeout rates',
    f'Timeout (0 remaining): short/normal {sn["timed_out_frac"]*100:.1f}%, '
    f'medium/normal {mn["timed_out_frac"]*100:.1f}%, long/normal {ln2["timed_out_frac"]*100:.1f}%. '
    f'Hard mode: short {sh["timed_out_frac"]*100:.1f}%, medium {mh["timed_out_frac"]*100:.1f}%, '
    f'long {lh["timed_out_frac"]*100:.1f}%. '
    f'Timeout should stay below ~10% on normal to avoid frustration. '
    f'If too high, reduce overchargedChanceByHeatLevel[3] from 25% to 15%.')

impl('Time bonus impact',
    f'Mean time bonus: short/normal {sn["time_bonus_mean"]:.0f}/{SCORE_TIME_BONUS_MAX}, '
    f'medium/normal {mn["time_bonus_mean"]:.0f}/{SCORE_TIME_BONUS_MAX}, '
    f'long/normal {ln2["time_bonus_mean"]:.0f}/{SCORE_TIME_BONUS_MAX}. '
    f'The doubled bonus (300 max) now represents {SCORE_TIME_BONUS_MAX/1100*100:.0f}% of max score. '
    f'Players who avoid or survive Overcharged get meaningfully better scores.')

impl('Tuning lever',
    f'The primary tuning knob is overchargedChanceByHeatLevel in curses.json. '
    f'Current values: heat2=10%, heat3=25%, heat4=45%, heat5=65%. '
    f'If timer feels too soft, raise heat3 to 35%. '
    f'If too harsh, lower heat4 to 35% and heat3 to 15%. '
    f'Stack cap (currently 3) is the second lever for extreme cases.')

out='/Users/sierro/Claude/docs/run_simulation_v3_report.pdf'
pdf.output(out)
print(f'\nPDF written to {out}')

# Console summary
print(f'\n{"="*90}')
print(f'V3 OVERCHARGED CURSE SIMULATION - {N:,} runs per combo')
print(f'{"="*90}')
print(f'\n{"Mode/Diff":<15}{"Got OC":>8}{"<5min":>8}{"Timeout":>8}{"Pen mean":>10}{"Rem mean":>10}{"TBonus":>8}')
print('-'*67)
for mode in MODES:
    for diff in DIFFS:
        s2=summary[(mode,diff)]
        print(f'{mode+"/"+diff:<15}'
              f'{s2["got_oc_frac"]*100:>7.1f}%'
              f'{s2["lt5m_frac"]*100:>7.1f}%'
              f'{s2["timed_out_frac"]*100:>7.1f}%'
              f'{s2["penalty_mean"]:>9.0f}s'
              f'{s2["remaining_mean"]/60:>9.1f}m'
              f'{s2["time_bonus_mean"]:>8.0f}')
