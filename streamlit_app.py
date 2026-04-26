from __future__ import annotations

from datetime import datetime, timezone
import json
import math
from pathlib import Path

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st


ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "web/network_insurance_explorer/data/network_insurance_explorer_data.js"
VISIT_COUNTER_PATH = ROOT / "visit_counter.json"

COLORS = {
    "Domestic": "#168b86",
    "Foreign": "#c95c3f",
    "ROW": "#8b9298",
    "Gold": "#c9972f",
    "Ink": "#17212b",
}

RULE_LABELS = {
    "bottleneck": "Bottleneck exposure rule",
    "downstream_rule": "Downstream exposure rule",
    "propagation_rule": "Propagation rule",
    "size_rule": "Sector-size rule",
    "horizontal": "Horizontal support",
}


@st.cache_data(show_spinner=False)
def load_data() -> dict:
    if not DATA_PATH.exists():
        return {}
    text = DATA_PATH.read_text(encoding="utf-8").strip()
    prefix = "window.EXPLORER_DATA = "
    if text.startswith(prefix):
        text = text[len(prefix) :]
    if text.endswith(";"):
        text = text[:-1]
    return json.loads(text)


def register_visit() -> None:
    """Count one anonymous visit per Streamlit browser session.

    The counter is intentionally invisible in the UI. It writes a tiny local
    JSON file and emits a log line visible in Streamlit Cloud logs.
    """
    if st.session_state.get("_visit_counted"):
        return
    st.session_state["_visit_counted"] = True

    now = datetime.now(timezone.utc)
    day = now.date().isoformat()
    payload = {"total": 0, "by_day": {}, "last_visit_utc": None}

    try:
        if VISIT_COUNTER_PATH.exists():
            payload.update(json.loads(VISIT_COUNTER_PATH.read_text(encoding="utf-8")))
        payload["total"] = int(payload.get("total") or 0) + 1
        payload["by_day"] = payload.get("by_day") or {}
        payload["by_day"][day] = int(payload["by_day"].get(day) or 0) + 1
        payload["last_visit_utc"] = now.isoformat(timespec="seconds")

        tmp_path = VISIT_COUNTER_PATH.with_suffix(".tmp")
        tmp_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        tmp_path.replace(VISIT_COUNTER_PATH)

        print(
            "VISIT_COUNTER "
            f"total={payload['total']} "
            f"day={day} "
            f"day_count={payload['by_day'][day]} "
            f"last_visit_utc={payload['last_visit_utc']}",
            flush=True,
        )
    except Exception as exc:
        print(f"VISIT_COUNTER_ERROR {type(exc).__name__}: {exc}", flush=True)


def pct(x, digits=1):
    if x is None or (isinstance(x, float) and not math.isfinite(x)):
        return "n/a"
    return f"{x * 100:.{digits}f}%"


def pp(x, digits=1):
    if x is None or (isinstance(x, float) and not math.isfinite(x)):
        return "n/a"
    return f"{x * 100:.{digits}f} pp"


def key(country, year):
    return f"{country}|{int(year)}"


def rows(data, name, country, year):
    k = key(country, year)
    return pd.DataFrame([r for r in data.get(name, []) if r.get("key") == k])


def row(data, country, year):
    for r in data.get("summary", []):
        if r["destination_country"] == country and int(r["year"]) == int(year):
            return r
    return {}


def kpis(r, frontier):
    cols = st.columns(5)
    cols[0].metric("Foreign exposure share", pct(r.get("foreign_exposure")))
    cols[1].metric("Domestic exposure share", pct(r.get("domestic_exposure")))
    cols[2].metric("K_net replacement capacity", pct(r.get("network_absorbable_share_of_foreign")))
    cols[3].metric("Actual absorption efficiency", pct(r.get("actual_absorption_efficiency")))
    adv = None if frontier.empty else frontier.iloc[0].get("targeted_policy_advantage_absorbed")
    cols[4].metric("Targeted advantage", pp(adv))


def selected_frontier(data, country, year, budget):
    f = rows(data, "frontier", country, year)
    if f.empty:
        return f
    return f.loc[(f["policy_budget_share"] - budget).abs() < 1e-9].head(1)


def source_architecture(data, country, year, top_n):
    st.subheader("Source-country composition")
    sc = rows(data, "sourceCountry", country, year)
    if not sc.empty:
        fig = px.bar(
            sc,
            x="exposure_share",
            y="source_country",
            orientation="h",
            color="source_country",
            color_discrete_sequence=[COLORS["Domestic"], COLORS["Foreign"], COLORS["ROW"], COLORS["Gold"]],
            labels={"exposure_share": "Exposure share", "source_country": "Source country"},
        )
        fig.update_layout(showlegend=False, height=320, xaxis_tickformat=".0%")
        st.plotly_chart(fig, use_container_width=True)

    left, right = st.columns(2)
    ss = rows(data, "sourceSector", country, year)
    with left:
        st.subheader("Top source countries")
        if not sc.empty:
            st.dataframe(sc[["source_country", "exposure_share", "rank"]], use_container_width=True, hide_index=True)
    with right:
        st.subheader("Top source sectors")
        if not ss.empty:
            st.dataframe(
                ss[["industry_code", "industry_description", "exposure_share", "rank"]],
                use_container_width=True,
                hide_index=True,
            )

    st.subheader("Country-sector node table")
    nodes = rows(data, "topNodes", country, year).head(top_n)
    if not nodes.empty:
        st.dataframe(
            nodes[
                [
                    "rank",
                    "source_country",
                    "industry_code",
                    "industry_description",
                    "scope",
                    "exposure_share",
                ]
            ],
            use_container_width=True,
            hide_index=True,
        )


def atlas(data, country, year):
    summary = pd.DataFrame(data.get("summary", []))
    current = summary.loc[summary["year"] == year].copy()
    current = current.sort_values("foreign_exposure", ascending=False)
    left, right = st.columns(2)
    with left:
        fig = px.bar(
            current.head(15),
            x="foreign_exposure",
            y="destination_country",
            orientation="h",
            color_discrete_sequence=[COLORS["Foreign"]],
        )
        fig.update_layout(height=430, xaxis_tickformat=".0%", yaxis_title="", xaxis_title="Foreign exposure")
        st.plotly_chart(fig, use_container_width=True)
    with right:
        change = current.sort_values("delta_foreign_exposure_2000_2014", ascending=False).head(15)
        fig = px.bar(
            change,
            x="delta_foreign_exposure_2000_2014",
            y="destination_country",
            orientation="h",
            color_discrete_sequence=[COLORS["Gold"]],
        )
        fig.update_layout(height=430, xaxis_tickformat=".0%", yaxis_title="", xaxis_title="Change, 2000-2014")
        st.plotly_chart(fig, use_container_width=True)
    st.dataframe(
        current[
            [
                "destination_country",
                "foreign_exposure",
                "delta_foreign_exposure_2000_2014",
                "network_absorbable_share_of_foreign",
                "targeted_policy_additional_absorbed",
                "horizontal_policy_additional_absorbed",
                "targeted_policy_advantage_absorbed",
            ]
        ],
        use_container_width=True,
        hide_index=True,
    )


def layers(data, country, year):
    la = rows(data, "layerAgg", country, year)
    if not la.empty:
        fig = px.bar(
            la,
            x="layer",
            y="exposure_share",
            color="scope",
            color_discrete_map={"Domestic": COLORS["Domestic"], "Foreign": COLORS["Foreign"], "ROW": COLORS["ROW"]},
            labels={"exposure_share": "Exposure share", "layer": "Network layer"},
        )
        fig.update_layout(yaxis_tickformat=".0%", height=420)
        st.plotly_chart(fig, use_container_width=True)
    st.caption("Layer 0 = final-demand exposure; Layer 1 = one-step input exposure; Layer 2 = two-step input exposure; Layer 3+ = residual deeper network exposure.")

    ls = rows(data, "layerSector", country, year)
    if not ls.empty:
        pivot = ls.pivot_table(index=["industry_code", "industry_description"], columns="layer", values="exposure_share", aggfunc="sum").fillna(0)
        st.dataframe(pivot.reset_index(), use_container_width=True, hide_index=True)


def network(data, country, year, compare, top_n):
    def fig_for(c):
        nodes = rows(data, "topNodes", c, year).head(top_n)
        if nodes.empty:
            return go.Figure()
        nodes = nodes.copy()
        nodes["theta"] = [i / len(nodes) * 360 for i in range(len(nodes))]
        nodes["r"] = [1.0 + (i % 3) * 0.22 for i in range(len(nodes))]
        fig = px.scatter_polar(
            nodes,
            r="r",
            theta="theta",
            size="exposure_share",
            color="scope",
            hover_name="node_id",
            hover_data=["industry_description", "exposure_share"],
            color_discrete_map={"Domestic": COLORS["Domestic"], "Foreign": COLORS["Foreign"], "ROW": COLORS["ROW"]},
            size_max=32,
        )
        fig.add_trace(go.Scatterpolar(r=[0], theta=[0], mode="markers+text", marker=dict(size=34, color=COLORS["Ink"]), text=[f"{c}<br>household"], textfont=dict(color="white", size=10), hoverinfo="skip", showlegend=False))
        fig.update_layout(height=470, polar=dict(radialaxis=dict(visible=False), angularaxis=dict(visible=False)))
        return fig

    left, right = st.columns(2)
    with left:
        st.subheader(f"{country}, {year}")
        st.plotly_chart(fig_for(country), use_container_width=True)
    with right:
        if compare:
            st.subheader(f"{compare}, {year}")
            st.plotly_chart(fig_for(compare), use_container_width=True)
        else:
            st.info("Choose a comparison country in the sidebar.")


def replacement(data, country, year):
    flows = rows(data, "replacementFlows", country, year)
    industries = rows(data, "replacementIndustry", country, year)
    if not flows.empty:
        left_nodes = flows["source_industry_code"].drop_duplicates().head(10).tolist()
        right_nodes = flows["receiver_industry_code"].drop_duplicates().head(10).tolist()
        labels = left_nodes + right_nodes
        idx = {label: i for i, label in enumerate(labels)}
        f = flows.loc[flows["source_industry_code"].isin(left_nodes) & flows["receiver_industry_code"].isin(right_nodes)]
        fig = go.Figure(
            data=[
                go.Sankey(
                    node=dict(label=labels, pad=12, thickness=14),
                    link=dict(
                        source=[idx[x] for x in f["source_industry_code"]],
                        target=[idx[x] for x in f["receiver_industry_code"]],
                        value=f["mapped_exposure"],
                        color="rgba(201,92,63,0.28)",
                    ),
                )
            ]
        )
        fig.update_layout(height=440)
        st.plotly_chart(fig, use_container_width=True)
    if not industries.empty:
        st.dataframe(
            industries[
                [
                    "rank",
                    "industry_code",
                    "industry_description",
                    "foreign_exposure_in_industry",
                    "network_absorbable_foreign_exposure",
                    "network_unabsorbed_foreign_exposure",
                ]
            ],
            use_container_width=True,
            hide_index=True,
        )


def policy(data, country, year, budget):
    f = rows(data, "frontier", country, year).sort_values("policy_budget_share")
    s = selected_frontier(data, country, year, budget)
    if not s.empty:
        r = s.iloc[0]
        c1, c2, c3 = st.columns(3)
        c1.metric("Bottleneck rule absorbs", pp(r["targeted_policy_additional_absorbed"]), f"new foreign exposure {pct(r['targeted_foreign_exposure'])}")
        c2.metric("Horizontal support absorbs", pp(r["horizontal_policy_additional_absorbed"]), f"new foreign exposure {pct(r['horizontal_foreign_exposure'])}")
        c3.metric("Advantage", pp(r["targeted_policy_advantage_absorbed"]), f"wasted horizontal budget {pp(r['horizontal_policy_budget_wasted'])}")
    rules = rows(data, "ruleComparison", country, year).sort_values("additional_absorbed", ascending=False)
    left, right = st.columns(2)
    with left:
        if not rules.empty:
            fig = px.bar(rules, x="additional_absorbed", y="label", orientation="h", color_discrete_sequence=[COLORS["Gold"]])
            fig.update_layout(height=380, xaxis_tickformat=".0%", yaxis_title="", xaxis_title="Additional absorbed foreign exposure")
            st.plotly_chart(fig, use_container_width=True)
    with right:
        if not f.empty:
            fig = go.Figure()
            fig.add_trace(go.Scatter(x=f["policy_budget_share"], y=f["targeted_policy_additional_absorbed"], name="targeted", mode="lines+markers", line=dict(color=COLORS["Gold"])))
            fig.add_trace(go.Scatter(x=f["policy_budget_share"], y=f["horizontal_policy_additional_absorbed"], name="horizontal", mode="lines+markers", line=dict(color=COLORS["Foreign"])))
            fig.update_layout(height=380, xaxis_tickformat=".0%", yaxis_tickformat=".0%", xaxis_title="Budget q", yaxis_title="Absorbed exposure")
            st.plotly_chart(fig, use_container_width=True)
    targets = rows(data, "policyTargets", country, year)
    if not targets.empty:
        st.subheader("Top targeted domestic industries")
        st.dataframe(
            targets[
                [
                    "rank",
                    "industry_code",
                    "industry_description",
                    "bottleneck_absorbable_foreign_exposure",
                    "horizontal_policy_absorbable_foreign_exposure",
                    "network_unabsorbed_foreign_exposure",
                ]
            ],
            use_container_width=True,
            hide_index=True,
        )


def dynamic(data, country):
    lp = pd.DataFrame(data.get("lp", []))
    series = pd.DataFrame([r for r in data.get("dynamicSeries", []) if r["destination_country"] == country])
    left, right = st.columns(2)
    with left:
        if not lp.empty:
            fig = go.Figure()
            fig.add_trace(
                go.Scatter(
                    x=lp["horizon"],
                    y=lp["coef"],
                    error_y=dict(type="data", array=1.96 * lp["std_err"]),
                    mode="markers+lines",
                    marker=dict(color=COLORS["Gold"], size=10),
                    name="interaction",
                )
            )
            fig.add_hline(y=0, line_dash="dash", line_color="#66717c")
            fig.update_layout(height=380, xaxis_title="Horizon", yaxis_title="Coefficient")
            st.plotly_chart(fig, use_container_width=True)
    with right:
        if not series.empty:
            fig = go.Figure()
            for field, label, color in [
                ("lag_weighted_foreign_mean_dln_pwt_rgdpo", "foreign shock z", COLORS["Foreign"]),
                ("lag_network_absorbable_share_of_foreign", "lagged K_net", COLORS["Domestic"]),
                ("d_foreign_exposure", "delta foreign exposure", COLORS["Gold"]),
            ]:
                fig.add_trace(go.Scatter(x=series["year"], y=series[field], mode="lines+markers", name=label, line=dict(color=color)))
            fig.update_layout(height=380, xaxis_title="Year")
            st.plotly_chart(fig, use_container_width=True)
    st.info("Positive interaction is a reallocation-elasticity diagnostic, not a claim that capacity raises unconditional vulnerability.")


def bridge():
    c1, c2 = st.columns(2)
    with c1:
        st.markdown("**Exposure statistic**")
        st.write("Theory object: `s = diag(nu)(I - B)^-1 f`. Data: WIOD input-output shares, household final demand, and value-added shares.")
        st.markdown("**Policy object**")
        st.write("Not full welfare, not fiscal cost, not autarky. The object is exposure-unit absorption under a fixed replacement budget.")
    with c2:
        st.markdown("**Replacement-capacity proxy**")
        st.write("`K_net` is the share of foreign exposure absorbable by observed domestic replacement margins.")
        st.markdown("**Wedge intuition**")
        st.write("Private value is local appropriable surplus; exposure value is downstream cost-of-living insurance.")


def main():
    st.set_page_config(page_title="Network Insurance Explorer", layout="wide")
    register_visit()
    st.title("Network Insurance Explorer")
    st.caption("Where foreign risk reaches households, and which spare routes can absorb it.")

    data = load_data()
    if not data:
        st.error("Explorer data is missing. Run: `python3 scripts/build_network_insurance_explorer_data.py`")
        return

    countries = data["countries"]
    years = data["years"]
    with st.sidebar:
        country = st.selectbox("Destination country", countries, index=countries.index("LUX") if "LUX" in countries else 0)
        year = st.slider("Year", min_value=min(years), max_value=max(years), value=2014)
        compare_options = ["None"] + countries
        compare = st.selectbox("Compare with", compare_options, index=compare_options.index("IND") if "IND" in compare_options else 0)
        compare = None if compare == "None" else compare
        budget = st.select_slider("Budget q", options=[0.05, 0.10, 0.25, 0.50], value=0.25, format_func=lambda x: f"{int(x * 100)}%")
        top_n = st.selectbox("Node view", [10, 20, 50], index=1)
        page = st.radio(
            "Mode",
            [
                "Guided story",
                "Country atlas",
                "Exposure architecture",
                "Network layers",
                "Network explorer",
                "Replacement audit",
                "Policy simulator",
                "Dynamic adjustment",
                "Theory-to-data bridge",
            ],
        )

    r = row(data, country, year)
    sf = selected_frontier(data, country, year, budget)
    kpis(r, sf)

    if page == "Guided story":
        st.markdown("### Exposure is not imports")
        source_architecture(data, country, year, top_n)
        st.markdown("### Policy value depends on placement")
        policy(data, country, year, budget)
    elif page == "Country atlas":
        atlas(data, country, year)
    elif page == "Exposure architecture":
        source_architecture(data, country, year, top_n)
    elif page == "Network layers":
        layers(data, country, year)
    elif page == "Network explorer":
        network(data, country, year, compare, top_n)
    elif page == "Replacement audit":
        replacement(data, country, year)
    elif page == "Policy simulator":
        policy(data, country, year, budget)
    elif page == "Dynamic adjustment":
        dynamic(data, country)
    else:
        bridge()


if __name__ == "__main__":
    main()
