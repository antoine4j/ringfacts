"""Compare passes. Primary metric: the pile of answers no option wins clearly.
Guard against confidence-hacking: entropy of the chosen-answer distribution must
not fall while confidence rises - that is how a question gets 'confident' by
losing its nuance."""
import json,sys,collections,statistics,math
def load(n):
    return {str(r["id"]):r for r in json.load(open(f"results-p{n}.json")) if r.get("answers")}
def ent(c):
    n=sum(c.values()); return -sum(v/n*math.log2(v/n) for v in c.values() if v)
passes=[int(a) for a in sys.argv[1:]] or [1,2]
P={n:load(n) for n in passes}
QS=sorted(set.intersection(*[set(next(iter(p.values()))["answers"]) for p in P.values()]))
print(f"passes {passes}   questions in common: {', '.join(QS)}\n")
hdr=f"{'question':18}" + "".join(f"{'unsure p'+str(n):>11}" for n in passes) + "".join(f"{'conf p'+str(n):>9}" for n in passes) + "".join(f"{'entr p'+str(n):>9}" for n in passes)
print(hdr)
for q in QS:
    row=f"  {q:16}"
    for n in passes: row+=f"{sum(1 for r in P[n].values() if max(r['answers'][q]['probabilities'].values())<0.5):>11}"
    for n in passes: row+=f"{statistics.median(r['answers'][q]['confidence'] for r in P[n].values()):>9.2f}"
    for n in passes: row+=f"{ent(collections.Counter(r['answers'][q]['choice'] for r in P[n].values())):>9.2f}"
    print(row)
def hardset(p,qs): return {k for k,r in p.items() if any(max(r['answers'][q]['probabilities'].values())<0.5 for q in qs)}
print("\nARTICLES WITH AT LEAST ONE UNSURE ANSWER")
for n in passes: print(f"  pass {n}: {len(hardset(P[n],QS)):>4} of {len(P[n])}")
noS=[q for q in QS if q!="sourcing"]
print("  ... excluding `sourcing`:")
for n in passes: print(f"  pass {n}: {len(hardset(P[n],noS)):>4} of {len(P[n])}")
print("\nESCAPE HATCH weight >0.15")
for n in passes:
    print(f"  pass {n}: {sum(1 for r in P[n].values() for q in QS if r['answers'][q]['probabilities']['not_in_this_list']>0.15):>4} of {len(P[n])*len(QS)} answers")
print("\nANSWER MIX, latest pass")
for q in QS:
    c=collections.Counter(r['answers'][q]['choice'] for r in P[passes[-1]].values())
    print(f"  {q}: " + "  ".join(f"{k}={v}" for k,v in c.most_common()))
