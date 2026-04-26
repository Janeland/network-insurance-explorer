# Network Insurance Explorer

Interactive companion website for the exposure and replacement-capacity paper.

## Stable public site

GitHub Pages static version:

https://janeland.github.io/network-insurance-explorer/

This version does not hibernate.

## Run locally

```bash
pip install -r requirements.txt
streamlit run streamlit_app.py
```

## Deploy on Streamlit Community Cloud

Use `streamlit_app.py` as the app entrypoint.

## Anonymous Visit Counter

The app increments one anonymous visit per Streamlit browser session. It is not
shown in the UI. Check Streamlit Cloud logs for lines like:

```text
VISIT_COUNTER total=12 day=2026-04-26 day_count=3 last_visit_utc=2026-04-26T11:30:00+00:00
```
