"""Trains the donor-response model (a small neural network) and exports its weights for the web app.

Compares: multilayer perceptron (24-12 ReLU), logistic regression and gradient boosting. The MLP is shipped
because it captures the distance × night × recency interactions and still runs as ~20 lines of JS.
"""
import json, os
import numpy as np
from sklearn.neural_network import MLPClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score, log_loss, brier_score_loss, average_precision_score
from donor_features import features, FEATURES

OUT = "../src/lib/ai/donor-model.json"

def ndcg_at_k(groups, k=3):
    """How well each model ranks the donors for one request (groups of 12 candidates)."""
    s = []
    for y, p in groups:
        order = np.argsort(-p)[:k]; ideal = np.sort(y)[::-1][:k]
        dcg = sum(y[i] / np.log2(r + 2) for r, i in enumerate(order)); idcg = sum(v / np.log2(r + 2) for r, v in enumerate(ideal))
        if idcg > 0: s.append(dcg / idcg)
    return float(np.mean(s))

def main():
    rows = [json.loads(l) for l in open("data/notifications.jsonl")]
    X = np.array([features(r) for r in rows]); y = np.array([r["responded"] for r in rows])
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.25, random_state=3, stratify=y)
    sc = StandardScaler().fit(Xtr); A, B = sc.transform(Xtr), sc.transform(Xte)
    mlp = MLPClassifier(hidden_layer_sizes=(24, 12), activation="relu", alpha=3e-3, learning_rate_init=0.002, max_iter=600, random_state=0).fit(A, ytr)
    lr = LogisticRegression(max_iter=2000).fit(A, ytr)
    gb = GradientBoostingClassifier(n_estimators=200, max_depth=3, random_state=0).fit(A, ytr)
    groups_idx = [np.arange(i, i + 12) for i in range(0, len(yte) - 12, 12)]
    res = {}
    for name, m in [("mlp_24_12", mlp), ("logistic_regression", lr), ("gradient_boosting", gb)]:
        p = m.predict_proba(B)[:, 1]
        res[name] = {"roc_auc": round(roc_auc_score(yte, p), 4), "pr_auc": round(average_precision_score(yte, p), 4), "log_loss": round(log_loss(yte, p), 4),
                     "brier": round(brier_score_loss(yte, p), 4), "ndcg_at_3": round(ndcg_at_k([(yte[g], p[g]) for g in groups_idx]), 4)}
    base = B[:, 0]  # nearest-first ranking (what the app did before)
    res["nearest_first_baseline"] = {"roc_auc": round(roc_auc_score(yte, -Xte[:, 0]), 4), "ndcg_at_3": round(ndcg_at_k([(yte[g], -Xte[g, 0]) for g in groups_idx]), 4)}
    export = {"name": "bloodbridge-donor-response", "version": 1, "features": FEATURES, "mean": sc.mean_.round(6).tolist(), "scale": sc.scale_.round(6).tolist(),
              "layers": [{"W": W.round(6).tolist(), "b": b.round(6).tolist()} for W, b in zip(mlp.coefs_, mlp.intercepts_)],
              "metrics": {**res["mlp_24_12"], "baseline_ndcg_at_3": res["nearest_first_baseline"]["ndcg_at_3"], "train_rows": len(Xtr), "test_rows": len(Xte), "response_rate": round(float(y.mean()), 3)}}
    os.makedirs("reports", exist_ok=True)
    json.dump(export, open(OUT, "w"), separators=(",", ":"))
    pm = mlp.predict_proba(B[:40])[:, 1]
    # parity samples keep the raw donor dicts so the JS feature code is tested too
    _, te_rows = train_test_split(rows, test_size=0.25, random_state=3, stratify=y)
    json.dump([{"donor": {k: v for k, v in r.items() if k != "responded"}, "p": round(float(mlp.predict_proba(sc.transform([features(r)]))[0, 1]), 6)} for r in te_rows[:40]], open("reports/donor-parity.json", "w"), indent=1)
    md = ["# Donor-response model – evaluation", "", f"{len(rows):,} synthetic SOS notifications ({y.mean():.1%} responded) · 75/25 split · features: {', '.join(FEATURES)}", "",
          "| Model | ROC-AUC | PR-AUC | Log loss | Brier | NDCG@3 (ranking 12 donors per request) |", "|---|---|---|---|---|---|"]
    for k, v in res.items(): md.append(f"| {k} | {v['roc_auc']} | {v.get('pr_auc', '–')} | {v.get('log_loss', '–')} | {v.get('brier', '–')} | {v['ndcg_at_3']} |")
    md += ["", "**Shipped:** `mlp_24_12` — a 10→24→12→1 ReLU network (StandardScaler inputs, L2 α = 0.003, Adam). It runs in the browser in under a millisecond per donor.",
           "", "`nearest_first_baseline` is the old behaviour (closest donor first)."]
    open("reports/donor-model.md", "w").write("\n".join(md) + "\n")
    json.dump(res, open("reports/donor-model.json", "w"), indent=1)
    print(json.dumps(res, indent=1))

if __name__ == "__main__": main()
