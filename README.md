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

## Feedback Signal

The app includes a small optional `App opened OK` button. When clicked, it logs:

```text
FEEDBACK_EVENT {"event": "app_opened_ok", "timestamp_utc": "..."}
```
