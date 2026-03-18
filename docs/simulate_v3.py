"""
Map Game -- Monte Carlo run simulator v3
Proposed changes:
  1. Time costs per tool use (activates dead QUESTION_TIME_COST_MS mechanic)
  2. Thermometer inversion fixed (tight = expensive)
  3. NSEW 0.4->0.6, landmark 0.5->0.6
  4. Score time bonus max raised 150->300

Compares v2 (current live state) vs v3 (all proposed changes).

TIME MODEL
----------
v2: lock_frac * timer_s encodes total time used (walk + nav + tools implicitly).
    Remaining = timer * (1 - lock_frac).

v3: same lock_frac captures walk + nav overhead. Tool time costs are ADDITIVE
    on top of that, eating directly into the remaining clock.

    remaining_v3 = timer * (1 - lock_frac) - sum(tool_time_costs)
    forced_stop  = tool costs exhaust the remaining budget (with a small buffer)

Effect: players who use tools heavily arrive with less time showing on the clock,
reducing their time bonus AND risking forced stops on heavy-tool runs.
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
CURSE_TRIGGER  = {1: 0.20, 2: 0.40, 3: 0.65, 4: 0.90, 5: 1.00}
CURSE_SURCHARGE= {1: 0.25, 2: 0.50}
CURSE_DUR_S    = 300

# ============================================================
# V2 -- CURRENT LIVE STATE (partial rebalance, no time costs)
# ============================================================

RADAR_V2 = {
    'short':  [(50,.2),(100,.3),(150,.4),(250,.6),(350,.8),(400,1.0)],
    'medium': [(50,.2),(100,.3),(250,.4),(400,.6),(650,.8),(800,1.0)],
    'long':   [(50,.2),(100,.3),(250,.4),(500,.6),(900,.8),(1200,1.0)],
}
# Thermometer: still inverted (tight=cheap) -- current live
THERMO_V2 = {
    'short':  [(100,.4),(140,.3),(180,.2)],
    'medium': [(150,.4),(220,.3),(300,.2)],
    'long':   [(200,.4),(350,.3),(500,.2)],
}
COSTS_V2 = dict(nsew=0.4, landmark=0.5,
                near200=1.2, near100=1.5, horizon=1.0, uncorrupt=0.8)
SCORE_TIME_BONUS_V2 = 150

# ============================================================
# V3 -- ALL PROPOSED CHANGES
# ============================================================

RADAR_V3 = RADAR_V2   # 250m already at 0.6 in live game

# Thermometer FIXED: tight = expensive
THERMO_V3 = {
    'short':  [(100,.6),(140,.5),(180,.4)],
    'medium': [(150,.6),(220,.5),(300,.4)],
    'long':   [(200,.6),(350,.5),(500,.4)],
}
COSTS_V3 = dict(nsew=0.6, landmark=0.6,
                near200=1.2, near100=1.5, horizon=1.0, uncorrupt=0.8)

# Time costs per tool use (seconds). Does NOT scale with difficulty.
RADAR_TIME_V3  = [90, 120, 150, 150, 180, 180]
THERMO_TIME_V3 = [150, 120, 120]   # tight, mid, wide
NSEW_TIME_V3     = 180
LANDMARK_TIME_V3 = 120
PHOTO_TIME_V3    = {'near200': 120, 'near100': 120, 'horizon': 90, 'uncorrupt': 90}

SCORE_TIME_BONUS_V3 = 300

# Player stops using tools if next cost would leave < STOP_BUFFER_S remaining
STOP_BUFFER_S = 60

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

def sim_run(mode, diff, radar_tbl, thermo_tbl, costs,
            tool_time=None, score_time_bonus_max=150):
    timer_s  = MODE_TIMER_S[mode]
    hmult    = DIFF_HEAT_MULT[diff]

    lock_frac = min(1.0, max(0.1, random.gauss(LOCK_FRAC[(mode,diff)], 0.12)))

    # v2_remaining: time left on clock when player locks in (v2 baseline)
    v2_remaining_s = timer_s * (1.0 - lock_frac)

    mu, sd_t = TOOLS_DIST[(mode,diff)]
    n_tools_target = max(0, min(12, int(round(random.gauss(mu, sd_t)))))

    mix = dict(TOOL_MIX[mode])
    if diff == 'hard':
        extra = mix.pop('photo', 0)
        mix['radar']    = mix.get('radar', 0)    + extra * 0.7
        mix['landmark'] = mix.get('landmark', 0) + extra * 0.3
    tw = sum(mix.values()); mix = {k: v/tw for k, v in mix.items()}

    rpref = list(RADAR_PREF[mode])
    if diff == 'hard':
        rpref = [w * (1.6 - i * 0.25) for i, w in enumerate(rpref)]
        t = sum(rpref); rpref = [w/t for w in rpref]

    nsew_unlock_s = timer_s * 0.5
    heat = 0.0; tools_used = 0; tool_time_s = 0.0
    time_forced_stop = False
    curse_surcharge = 0.0; curse_end_s = -1
    curses_fired = {1:0, 2:0, 3:0, 4:0, 5:0}
    used_radar=set(); used_thermo=set(); used_nsew=set()
    used_landmark=set(); used_photo=set()

    for attempt in range(n_tools_target):
        cur_t = (attempt / max(1, n_tools_target)) * lock_frac * timer_s
        if cur_t > curse_end_s: curse_surcharge = 0.0

        avail = dict(mix)
        if cur_t < nsew_unlock_s:                        avail.pop('nsew', None)
        if len(used_radar)  >= len(radar_tbl[mode]):     avail.pop('radar', None)
        if len(used_thermo) >= len(thermo_tbl[mode]):    avail.pop('thermo', None)
        if len(used_nsew)   >= 2:                        avail.pop('nsew', None)
        if len(used_landmark) >= 5:                      avail.pop('landmark', None)
        if len(used_photo) >= 3 or (diff=='hard' and len(used_photo)>=1):
            avail.pop('photo', None)
        if not avail: break

        tw = sum(avail.values())
        tool = wc(list(avail.keys()), [v/tw for v in avail.values()])

        base = 0.0; t_cost = 0.0
        if tool == 'radar':
            free = [i for i in range(len(radar_tbl[mode])) if i not in used_radar]
            if not free: continue
            fw = [rpref[i] for i in free]; ft = sum(fw)
            ci = wc(free, [w/ft for w in fw])
            _, base = radar_tbl[mode][ci]; used_radar.add(ci)
            if tool_time: t_cost = tool_time['radar'][min(ci, len(tool_time['radar'])-1)]
        elif tool == 'thermo':
            free = [i for i in range(len(thermo_tbl[mode])) if i not in used_thermo]
            if not free: continue
            ci = random.choice(free)
            _, base = thermo_tbl[mode][ci]; used_thermo.add(ci)
            if tool_time: t_cost = tool_time['thermo'][min(ci, len(tool_time['thermo'])-1)]
        elif tool == 'nsew':
            axes = [a for a in ('NS','EW') if a not in used_nsew]
            if not axes: continue
            used_nsew.add(random.choice(axes)); base = costs['nsew']
            if tool_time: t_cost = tool_time['nsew']
        elif tool == 'landmark':
            types = [t for t in ('train_station','cathedral','bus_station','library','museum')
                     if t not in used_landmark]
            if not types: continue
            used_landmark.add(random.choice(types)); base = costs['landmark']
            if tool_time: t_cost = tool_time['landmark']
        elif tool == 'photo':
            opts = [k for k in ('near200','horizon','uncorrupt') if k not in used_photo]
            if not opts: continue
            ch = random.choice(opts); used_photo.add(ch); base = costs[ch]
            if tool_time: t_cost = tool_time['photo'].get(ch, 90)

        # v3: stop if this tool's cost would exhaust the remaining clock
        if tool_time is not None:
            budget_left = v2_remaining_s - tool_time_s
            if t_cost > budget_left - STOP_BUFFER_S:
                time_forced_stop = True
                break

        actual = base * hmult + curse_surcharge
        if actual + heat >= 5.0 and diff in ('normal','hard') and random.random() < 0.55: break
        if actual + heat >= 4.5 and diff == 'hard'            and random.random() < 0.45: break

        old_tier = heat_tier(heat)
        heat = heat + actual; new_tier = heat_tier(heat)
        tools_used += 1
        tool_time_s += t_cost

        for tier in range(old_tier + 1, min(new_tier + 1, 6)):
            if random.random() < CURSE_TRIGGER.get(tier, 0):
                curses_fired[tier] += 1
                s = CURSE_SURCHARGE.get(tier, 0)
                if s > 0:
                    curse_surcharge = max(curse_surcharge, s)
                    curse_end_s = cur_t + CURSE_DUR_S

    heat = min(heat, 5.0)

    remaining_s = max(0.0, v2_remaining_s - tool_time_s)
    time_bonus = score_time_bonus_max * (remaining_s / timer_s)

    return dict(
        tools_used=tools_used, tools_wanted=n_tools_target,
        heat_final=heat, lock_frac=lock_frac,
        remaining_s=remaining_s, v2_remaining_s=v2_remaining_s,
        tool_time_s=tool_time_s,
        time_frac_used=1.0 - remaining_s / timer_s,
        time_bonus=time_bonus,
        time_forced_stop=time_forced_stop,
        curses_fired=curses_fired, tier_reached=heat_tier(heat),
    )

# ============================================================
# RUN BOTH VERSIONS
# ============================================================

N = 3000
MODES = ['short', 'medium', 'long']
DIFFS = ['easy', 'normal', 'hard']

VERSIONS = [
    ('v2', RADAR_V2, THERMO_V2, COSTS_V2, None, SCORE_TIME_BONUS_V2),
    ('v3', RADAR_V3, THERMO_V3, COSTS_V3,
     dict(radar=RADAR_TIME_V3, thermo=THERMO_TIME_V3,
          nsew=NSEW_TIME_V3, landmark=LANDMARK_TIME_V3, photo=PHOTO_TIME_V3),
     SCORE_TIME_BONUS_V3),
]

print(f"Running {N} iters x 9 combos x 2 versions = {N*9*2} total simulations...")
results = {}
for ver, rtbl, ttbl, costs, tt, stbm in VERSIONS:
    for mode in MODES:
        for diff in DIFFS:
            k = (ver, mode, diff)
            results[k] = [sim_run(mode, diff, rtbl, ttbl, costs, tt, stbm) for _ in range(N)]
            print(f"  {ver}/{mode}/{diff} done")

def summarise(runs, score_time_bonus_max):
    tools   = [r['tools_used']       for r in runs]
    wanted  = [r['tools_wanted']     for r in runs]
    heat    = [r['heat_final']       for r in runs]
    tiers   = [r['tier_reached']     for r in runs]
    rem     = [r['remaining_s']      for r in runs]
    tbonus  = [r['time_bonus']       for r in runs]
    forced  = [r['time_forced_stop'] for r in runs]
    tt_s    = [r['tool_time_s']      for r in runs]
    total_curses = {t: sum(r['curses_fired'][t] for r in runs)/N for t in range(1,6)}
    return dict(
        tools_mean=statistics.mean(tools),  tools_med=statistics.median(tools),
        tools_p25=pct(tools,25),            tools_p75=pct(tools,75),
        tools_wanted_mean=statistics.mean(wanted),
        heat_mean=statistics.mean(heat),    heat_med=statistics.median(heat),
        heat_p25=pct(heat,25),              heat_p75=pct(heat,75),
        remaining_mean=statistics.mean(rem),
        remaining_med=statistics.median(rem),
        remaining_p25=pct(rem,25),
        remaining_p75=pct(rem,75),
        tool_time_mean=statistics.mean(tt_s),
        time_bonus_mean=statistics.mean(tbonus),
        time_bonus_frac=statistics.mean(tbonus) / score_time_bonus_max,
        pct_time_forced=sum(1 for f in forced if f) / N,
        pct_under_5min=sum(1 for r in rem if r < 300) / N,
        pct_under_2min=sum(1 for r in rem if r < 120) / N,
        tier_dist={t: sum(1 for x in tiers if x==t)/N for t in range(6)},
        tier_ge={t: sum(1 for x in tiers if x>=t)/N for t in range(1,6)},
        curses_per_run=total_curses,
        total_curses=sum(total_curses.values()),
    )

summary = {}
for ver, rtbl, ttbl, costs, tt, stbm in VERSIONS:
    for mode in MODES:
        for diff in DIFFS:
            summary[(ver,mode,diff)] = summarise(results[(ver,mode,diff)], stbm)

# ============================================================
# PDF
# ============================================================

BG=(8,12,20); SURF=(15,23,42); CARD=(22,35,58); BORDER=(42,63,96)
TEXT=(225,235,245); MUTED=(100,130,165); ACCENT=(80,170,255)
GREEN=(80,200,130); ORANGE=(220,140,60); RED_C=(220,80,80)
MODE_C={'short':(80,200,130),'medium':(80,170,255),'long':(200,100,255)}
DIFF_C={'easy':(80,200,130),'normal':(80,170,255),'hard':(220,80,80)}
V2_C=(130,130,170); V3_C=(80,210,140)

class PDF(FPDF):
    def header(self):
        self.set_fill_color(*BG); self.rect(0,0,210,297,'F')
    def footer(self):
        self.set_y(-12)
        self.set_font('Helvetica','I',7)
        self.set_text_color(*MUTED)
        self.cell(0,6,f'Map Game -- v3 Simulation  *  Liverpool / Lime Street  *  {N} iters  *  Page {self.page_no()}',align='C')

pdf = PDF('P','mm','A4')
pdf.set_auto_page_break(auto=True, margin=15)
pdf.add_page()

# Cover
pdf.set_fill_color(*SURF); pdf.rect(10,10,190,70,'F')
pdf.set_draw_color(*BORDER); pdf.set_line_width(0.4); pdf.rect(10,10,190,70)

pdf.set_xy(14,16); pdf.set_font('Helvetica','B',17)
pdf.set_text_color(*TEXT)
pdf.cell(0,8,'v3 Simulation - Timer Pressure Rebalance',ln=True)

pdf.set_x(14); pdf.set_font('Helvetica','',9.5); pdf.set_text_color(*MUTED)
pdf.cell(0,5,'Liverpool City Centre  *  Lime Street Station  *  v2 (live) vs v3 (proposed)',ln=True)
pdf.set_x(14); pdf.cell(0,5,f'{N} iterations per mode/difficulty combination',ln=True)

pdf.set_x(14); pdf.set_font('Helvetica','B',8); pdf.set_text_color(*ACCENT)
pdf.cell(0,5,'Changes: (1) time costs per tool  (2) thermo inversion fixed  (3) NSEW+landmark heat raised  (4) time bonus max 150->300',ln=True)

pdf.set_x(14); pdf.set_font('Helvetica','I',7.5); pdf.set_text_color(*MUTED)
pdf.cell(0,4,'Time model: remaining_v3 = timer*(1-lock_frac) - sum(tool_time_costs). Tool costs eat directly into the remaining clock.',ln=True)

pdf.ln(3)

# Change table
def chdr(y):
    pdf.set_fill_color(*SURF); pdf.rect(10,y,190,5,'F')
    pdf.set_font('Helvetica','B',7.5); pdf.set_text_color(*MUTED)
    for x,w,txt,clr in [(14,55,'Change',MUTED),(70,22,'V2',V2_C),(93,22,'V3',V3_C),(117,82,'Notes',MUTED)]:
        pdf.set_xy(x,y+0.5); pdf.set_text_color(*clr)
        pdf.cell(w,4,txt,align='C' if x!=14 and x!=117 else 'L')
    pdf.ln(5)

def crow(label,v2,v3,note,alt=False):
    y=pdf.get_y()
    if alt: pdf.set_fill_color(*CARD); pdf.rect(10,y,190,4.5,'F')
    pdf.set_font('Helvetica','',7); pdf.set_text_color(*MUTED)
    pdf.set_xy(14,y); pdf.cell(55,4.5,label)
    pdf.set_xy(70,y); pdf.set_text_color(*V2_C); pdf.cell(22,4.5,v2,align='C')
    pdf.set_xy(93,y); pdf.set_text_color(*V3_C); pdf.cell(22,4.5,v3,align='C')
    pdf.set_xy(117,y); pdf.set_text_color(*MUTED); pdf.cell(82,4.5,note)
    pdf.ln(4.5)

chdr(pdf.get_y())
change_rows = [
    ('Time cost: radar 50m','none','1.5 min',''),
    ('Time cost: radar 100m','none','2.0 min',''),
    ('Time cost: radar 150m/250m','none','2.5 min','Most-used option'),
    ('Time cost: radar 350m+','none','3.0 min',''),
    ('Time cost: thermometer tight','none','2.5 min',''),
    ('Time cost: thermometer mid/wide','none','2.0 min',''),
    ('Time cost: NSEW (per axis)','none','3.0 min','Strongest axis clue'),
    ('Time cost: landmark','none','2.0 min',''),
    ('Time cost: photo extra','none','2.0 min','Near100/Near200'),
    ('Thermo heat (tight/mid/wide)','0.4/0.3/0.2','0.6/0.5/0.4','Fixed: tight was cheaper than wide'),
    ('NSEW heat (per axis)','0.4','0.6','Both axes = 1.2 total'),
    ('Landmark heat','0.5','0.6',''),
    ('Score time bonus max','150 pts','300 pts','Doubles time bonus weight'),
]
for i,(a,b,c,d) in enumerate(change_rows):
    crow(a,b,c,d,alt=(i%2==1))

pdf.ln(4)

# Per-mode sections
def sec(title,r,g,b):
    y=pdf.get_y()
    pdf.set_fill_color(r//5,g//5,b//5); pdf.rect(10,y,190,8,'F')
    pdf.set_draw_color(r,g,b); pdf.set_line_width(0.5); pdf.line(10,y,10,y+8)
    pdf.set_xy(13,y+1); pdf.set_font('Helvetica','B',10)
    pdf.set_text_color(r,g,b); pdf.cell(0,6,title); pdf.ln(9)

RH=5
PC=[13,52,82,112,142,172]
PHDRS=[('V2/easy',V2_C),('V2/norm',V2_C),('V3/easy',DIFF_C['easy']),('V3/norm',DIFF_C['normal']),('V3/hard',DIFF_C['hard'])]

def chrow(label):
    y=pdf.get_y(); pdf.set_fill_color(*SURF); pdf.rect(10,y,190,5,'F')
    pdf.set_font('Helvetica','B',7); pdf.set_text_color(*MUTED)
    pdf.set_xy(PC[0],y); pdf.cell(38,5,label)
    for ci,(lbl,clr) in enumerate(PHDRS):
        pdf.set_xy(PC[ci+1],y); pdf.set_text_color(*clr); pdf.cell(28,5,lbl,align='C')
    pdf.ln(5)

def drow(label,vals,fmt,alt=False):
    clrs=[V2_C,V2_C,DIFF_C['easy'],DIFF_C['normal'],DIFF_C['hard']]
    y=pdf.get_y()
    if alt: pdf.set_fill_color(*CARD); pdf.rect(10,y,190,RH+1,'F')
    pdf.set_font('Helvetica','',7); pdf.set_text_color(*MUTED)
    pdf.set_xy(PC[0],y); pdf.cell(38,RH+1,label)
    for ci,v in enumerate(vals):
        pdf.set_xy(PC[ci+1],y); pdf.set_text_color(*clrs[ci])
        pdf.cell(28,RH+1,fmt(v),align='C')
    pdf.ln(RH+1)

def hrow(label,vals,fmt,cfn,alt=False):
    y=pdf.get_y()
    if alt: pdf.set_fill_color(*CARD); pdf.rect(10,y,190,RH+1,'F')
    pdf.set_font('Helvetica','',7); pdf.set_text_color(*MUTED)
    pdf.set_xy(PC[0],y); pdf.cell(38,RH+1,label)
    for ci,v in enumerate(vals):
        pdf.set_xy(PC[ci+1],y); pdf.set_font('Helvetica','B',7)
        pdf.set_text_color(*cfn(ci,v)); pdf.cell(28,RH+1,fmt(v),align='C')
    pdf.ln(RH+1)

def tier_col(ci,v):
    if v<0.08: return GREEN
    if v<0.20: return ORANGE
    return RED_C

def press_col(ci,v):
    if ci<=1: return MUTED
    if v<0.05: return MUTED
    if v<0.15: return ORANGE
    return GREEN

for mode in MODES:
    mr,mg,mb=MODE_C[mode]
    sec(f'{mode.upper()} MODE  -  {MODE_RADIUS_M[mode]}m radius, {MODE_TIMER_S[mode]//60}min timer',mr,mg,mb)
    chrow('METRIC')

    def sv(ver,diff): return summary[(ver,mode,diff)]
    vsets=[sv('v2','easy'),sv('v2','normal'),sv('v3','easy'),sv('v3','normal'),sv('v3','hard')]

    drow('Tools wanted (mean)',[x['tools_wanted_mean'] for x in vsets],lambda v:f'{v:.2f}')
    drow('Tools used (mean)',  [x['tools_mean']  for x in vsets],lambda v:f'{v:.2f}',alt=True)
    drow('Tools IQR',          [(x['tools_p25'],x['tools_p75']) for x in vsets],
         lambda v:f'{int(v[0])}-{int(v[1])}')
    drow('Heat mean',          [x['heat_mean'] for x in vsets],lambda v:f'{v:.2f}',alt=True)
    drow('Heat IQR',           [(x['heat_p25'],x['heat_p75']) for x in vsets],
         lambda v:f'{v[0]:.1f}-{v[1]:.1f}')
    drow('Curses per run',     [x['total_curses'] for x in vsets],lambda v:f'{v:.2f}',alt=True)

    pdf.ln(1)
    y=pdf.get_y(); pdf.set_fill_color(*SURF); pdf.rect(10,y,190,5,'F')
    pdf.set_font('Helvetica','B',7.5); pdf.set_text_color(*ACCENT)
    pdf.set_xy(13,y+0.5); pdf.cell(0,4,'TIMER PRESSURE'); pdf.ln(5)

    drow('Tool time cost (mean)',  [x['tool_time_mean'] for x in vsets],
         lambda v:f'{v:.0f}s ({v/60:.1f}m)')
    drow('Remaining at guess (mean)',[x['remaining_mean'] for x in vsets],
         lambda v:f'{v/60:.1f} min',alt=True)
    drow('Remaining IQR',[(x['remaining_p25'],x['remaining_p75']) for x in vsets],
         lambda v:f'{v[0]/60:.1f}-{v[1]/60:.1f}m')
    hrow('% runs forced to stop early',
         [x['pct_time_forced'] for x in vsets],lambda v:f'{v*100:.1f}%',press_col,alt=True)
    hrow('% runs with <5 min remaining',
         [x['pct_under_5min'] for x in vsets],lambda v:f'{v*100:.1f}%',press_col)
    hrow('% runs with <2 min remaining',
         [x['pct_under_2min'] for x in vsets],lambda v:f'{v*100:.1f}%',press_col,alt=True)
    drow('Time bonus captured (mean)',[x['time_bonus_mean'] for x in vsets],lambda v:f'{v:.0f} pts')
    drow('Time bonus % of max',[x['time_bonus_frac'] for x in vsets],
         lambda v:f'{v*100:.0f}%',alt=True)

    pdf.ln(2)
    y=pdf.get_y(); pdf.set_fill_color(*SURF); pdf.rect(10,y,190,5,'F')
    pdf.set_font('Helvetica','B',7.5); pdf.set_text_color(*MUTED)
    pdf.set_xy(13,y+0.5); pdf.cell(0,4,'HEAT TIER DISTRIBUTION'); pdf.ln(5)

    tlabels=['Tier 0  (<1.0)','Tier 1  (1-2)','Tier 2  (2-3)',
             'Tier 3  (3-4)','Tier 4  (4-5)','Tier 5  (=5.0)']
    for t in range(6):
        vs=[sv('v2','easy')['tier_dist'][t],sv('v2','normal')['tier_dist'][t],
            sv('v3','easy')['tier_dist'][t],sv('v3','normal')['tier_dist'][t],
            sv('v3','hard')['tier_dist'][t]]
        hrow(tlabels[t],vs,lambda v:f'{v*100:.1f}%',tier_col,alt=(t%2==1))

    pdf.ln(6)

# Summary page
pdf.add_page()
sec('Summary - v2 (live) vs v3 (proposed) at Normal Difficulty',*ACCENT)

sh=['Mode','V2 heat','V3 heat','V2 remain','V3 remain','V2 t.bonus','V3 t.bonus','V3 <5min%','V3 forced%']
sw=[22,17,17,20,20,20,20,20,22]
sx=[13]; [sx.append(sx[-1]+w) for w in sw[:-1]]

pdf.set_font('Helvetica','B',6.5); pdf.set_text_color(*MUTED)
for i,(h,w) in enumerate(zip(sh,sw)):
    pdf.set_xy(sx[i],pdf.get_y()); pdf.cell(w,5,h,align='C' if i>0 else 'L')
pdf.ln(6)

for ri,mode in enumerate(MODES):
    s2=summary[('v2',mode,'normal')]; s3=summary[('v3',mode,'normal')]
    mr,mg,mb=MODE_C[mode]; y=pdf.get_y()
    if ri%2==1: pdf.set_fill_color(*CARD); pdf.rect(10,y,190,6,'F')
    row=[(mode.upper(),mr,mg,mb,False),
         (f'{s2["heat_mean"]:.2f}',*V2_C,False),(f'{s3["heat_mean"]:.2f}',*V3_C,False),
         (f'{s2["remaining_mean"]/60:.1f}m',*V2_C,False),(f'{s3["remaining_mean"]/60:.1f}m',*V3_C,True),
         (f'{s2["time_bonus_mean"]:.0f}',*V2_C,False),(f'{s3["time_bonus_mean"]:.0f}',*V3_C,True),
         (f'{s3["pct_under_5min"]*100:.1f}%',*V3_C,False),(f'{s3["pct_time_forced"]*100:.1f}%',*V3_C,True)]
    for ci,(txt,r,g,b,bold) in enumerate(row):
        pdf.set_xy(sx[ci],y); pdf.set_font('Helvetica','B' if bold else '',6.5)
        pdf.set_text_color(r,g,b); pdf.cell(sw[ci],6,txt,align='C' if ci>0 else 'L')
    pdf.ln(6)

pdf.ln(5)

# % under 5 min grid
cx4=[13,65,105,145]; cw4=[50,36,36,36]
def grid_table(title, subtitle, getter, col_fn):
    pdf.set_font('Helvetica','B',9); pdf.set_text_color(*ACCENT)
    pdf.cell(0,5,title,ln=True)
    if subtitle:
        pdf.set_font('Helvetica','I',7.5); pdf.set_text_color(*MUTED)
        pdf.cell(0,4,subtitle,ln=True)
    pdf.ln(1)
    pdf.set_font('Helvetica','B',8); pdf.set_text_color(*MUTED)
    pdf.set_x(cx4[0]); pdf.cell(cw4[0],4,'MODE')
    for ci,d in enumerate(DIFFS):
        dr,dg,db=DIFF_C[d]; pdf.set_xy(cx4[ci+1],pdf.get_y())
        pdf.set_text_color(dr,dg,db); pdf.cell(cw4[ci+1],4,d.upper(),align='C')
    pdf.ln(5)
    for ri,mode in enumerate(MODES):
        y=pdf.get_y()
        if ri%2==1: pdf.set_fill_color(*CARD); pdf.rect(10,y,190,6,'F')
        mr,mg,mb=MODE_C[mode]
        pdf.set_font('Helvetica','B',8); pdf.set_text_color(mr,mg,mb)
        pdf.set_xy(cx4[0],y); pdf.cell(cw4[0],6,f'{mode.upper()} ({MODE_RADIUS_M[mode]}m)')
        for ci,diff in enumerate(DIFFS):
            v=getter(mode,diff)
            pdf.set_xy(cx4[ci+1],y); pdf.set_font('Helvetica','B',8)
            pdf.set_text_color(*col_fn(v)); pdf.cell(cw4[ci+1],6,f'{v*100:.1f}%',align='C')
        pdf.ln(6)
    pdf.ln(4)

def u5col(v):
    if v>0.30: return GREEN
    if v>0.15: return ORANGE
    return MUTED

def t4col(v):
    if v>0.30: return RED_C
    if v>0.10: return ORANGE
    return GREEN

grid_table('% runs finishing with <5 min remaining (v3) -- key timer pressure metric',
           'Green >30%: strong timer feel. Orange 15-30%: occasional. Dim <15%: rarely bites.',
           lambda m,d: summary[('v3',m,d)]['pct_under_5min'], u5col)

grid_table('Tier 4+ reach (v3) by mode x difficulty',
           None,
           lambda m,d: summary[('v3',m,d)]['tier_ge'][4], t4col)

# Remaining time comparison
pdf.set_font('Helvetica','B',9); pdf.set_text_color(*ACCENT)
pdf.cell(0,5,'Mean remaining time at guess (normal diff): v2 vs v3',ln=True); pdf.ln(1)
pdf.set_font('Helvetica','B',8); pdf.set_text_color(*MUTED)
pdf.set_x(cx4[0]); pdf.cell(cw4[0],4,'MODE')
for x,w,txt,c in [(cx4[1],cw4[1],'V2 normal',V2_C),(cx4[2],cw4[2],'V3 normal',V3_C),(cx4[3],cw4[3],'Delta',ORANGE)]:
    pdf.set_xy(x,pdf.get_y()); pdf.set_text_color(*c); pdf.cell(w,4,txt,align='C')
pdf.ln(5)
for ri,mode in enumerate(MODES):
    y=pdf.get_y()
    if ri%2==1: pdf.set_fill_color(*CARD); pdf.rect(10,y,190,6,'F')
    s2=summary[('v2',mode,'normal')]; s3=summary[('v3',mode,'normal')]
    mr,mg,mb=MODE_C[mode]
    pdf.set_font('Helvetica','B',8); pdf.set_text_color(mr,mg,mb)
    pdf.set_xy(cx4[0],y); pdf.cell(cw4[0],6,f'{mode.upper()} ({MODE_TIMER_S[mode]//60}min)')
    pdf.set_xy(cx4[1],y); pdf.set_text_color(*V2_C); pdf.set_font('Helvetica','',8)
    pdf.cell(cw4[1],6,f'{s2["remaining_mean"]/60:.1f} min',align='C')
    pdf.set_xy(cx4[2],y); pdf.set_text_color(*V3_C); pdf.set_font('Helvetica','B',8)
    pdf.cell(cw4[2],6,f'{s3["remaining_mean"]/60:.1f} min',align='C')
    delta=(s3["remaining_mean"]-s2["remaining_mean"])/60
    pdf.set_xy(cx4[3],y); pdf.set_text_color(*ORANGE); pdf.set_font('Helvetica','B',8)
    pdf.cell(cw4[3],6,f'{delta:+.1f} min',align='C')
    pdf.ln(6)

pdf.ln(5)

# Design assessment
def impl(hd,body):
    pdf.set_font('Helvetica','B',9); pdf.set_text_color(*TEXT)
    pdf.set_x(13); pdf.cell(0,4,hd,ln=True)
    pdf.set_x(13); pdf.set_font('Helvetica','',8); pdf.set_text_color(*MUTED)
    pdf.multi_cell(184,4,body); pdf.ln(2)

pdf.set_font('Helvetica','B',10); pdf.set_text_color(*ACCENT)
pdf.cell(0,5,'Design Assessment',ln=True); pdf.ln(2)

sn2={m:summary[('v2',m,'normal')] for m in MODES}
sn3={m:summary[('v3',m,'normal')] for m in MODES}

impl('Tool time costs compress the remaining clock (the primary effect)',
    f'Short/normal: avg remaining drops {sn2["short"]["remaining_mean"]/60:.1f} -> '
    f'{sn3["short"]["remaining_mean"]/60:.1f} min. '
    f'Medium: {sn2["medium"]["remaining_mean"]/60:.1f} -> {sn3["medium"]["remaining_mean"]/60:.1f} min. '
    f'Long: {sn2["long"]["remaining_mean"]/60:.1f} -> {sn3["long"]["remaining_mean"]/60:.1f} min. '
    f'The timer is now an active resource players consume with each tool use.')

impl('% runs finishing with <5 min remaining (v3/normal)',
    f'Short: {sn3["short"]["pct_under_5min"]*100:.0f}%  '
    f'Medium: {sn3["medium"]["pct_under_5min"]*100:.0f}%  '
    f'Long: {sn3["long"]["pct_under_5min"]*100:.0f}%. '
    f'These runs end with the player in the "final sprint" window. '
    f'In v2, essentially 0% of runs reached this state. '
    f'The higher rate on medium/long reflects both more tools used and longer walk times.')

impl('Time bonus doubling (150->300) reshapes the scoring incentive',
    f'With max 300 pts, the gap between an early guess (say 10 min remaining, v3/short) '
    f'and a late guess (1 min remaining) is now ~{300*9/30:.0f} pts vs ~{300*1/30:.0f} pts - '
    f'a {300*8/30:.0f} pt swing that crosses a full grade band. '
    f'Mean time bonus (v3/normal): short {sn3["short"]["time_bonus_mean"]:.0f}, '
    f'medium {sn3["medium"]["time_bonus_mean"]:.0f}, long {sn3["long"]["time_bonus_mean"]:.0f} pts. '
    f'Players who use fewer tools are now materially rewarded.')

impl('Forced stops are rare but intentional',
    f'Forced stop rate v3/normal: short {sn3["short"]["pct_time_forced"]*100:.1f}%, '
    f'medium {sn3["medium"]["pct_time_forced"]*100:.1f}%, '
    f'long {sn3["long"]["pct_time_forced"]*100:.1f}%. '
    f'Most players self-regulate before the hard budget. The primary effect is clock compression '
    f'and scoring pressure, not budget enforcement. Forced stops are a backstop for heavy tool use.')

impl('Hard mode on long: verify comfort in play',
    f'Long/hard v3: {summary[("v3","long","hard")]["pct_under_5min"]*100:.0f}% of runs under 5 min, '
    f'{summary[("v3","long","hard")]["pct_under_2min"]*100:.0f}% under 2 min. '
    f'Hard players use fewer tools (heat costs 1.5x) but time costs are flat, so the clock '
    f'still compresses meaningfully. If long/hard feels punishing, reduce NSEW time cost to 2.5 min first.')

out='/Users/sierro/Claude/docs/run_simulation_v3_report.pdf'
pdf.output(out)
print(f'\nPDF written to {out}')

print('\n--- QUICK COMPARISON (normal difficulty) ---')
print(f'{"Mode":<10}{"V2 heat":>10}{"V3 heat":>10}{"V2 rem":>10}{"V3 rem":>10}{"V2 t.bon":>10}{"V3 t.bon":>10}{"V3 <5min":>10}{"V3 forced":>10}')
for mode in MODES:
    s2=summary[('v2',mode,'normal')]; s3=summary[('v3',mode,'normal')]
    print(f'{mode:<10}{s2["heat_mean"]:>10.2f}{s3["heat_mean"]:>10.2f}'
          f'{s2["remaining_mean"]/60:>9.1f}m{s3["remaining_mean"]/60:>9.1f}m'
          f'{s2["time_bonus_mean"]:>10.1f}{s3["time_bonus_mean"]:>10.1f}'
          f'{s3["pct_under_5min"]*100:>9.1f}%{s3["pct_time_forced"]*100:>9.1f}%')

print('\n--- V3 <5 min remaining % by mode x diff ---')
print(f'{"":12}{"easy":>10}{"normal":>10}{"hard":>10}')
for mode in MODES:
    row=' '.join(f'{summary[("v3",mode,d)]["pct_under_5min"]*100:>10.1f}%' for d in DIFFS)
    print(f'{mode:<12}{row}')
