from pathlib import Path
import streamlit as st

from env_loader import load_lab_env
from providers import make_provider
from tools import load_tool_declarations, to_openai_tools
from chat import run_model_tool_loop
from versioning import build_artifact_version

ROOT = Path(__file__).parent
load_lab_env(ROOT)

st.set_page_config(page_title="IT Helpdesk Agent", layout="wide")

# Tải cấu hình và artifacts
SYSTEM_PROMPT_PATH = ROOT / "artifacts" / "system_prompt.md"
TOOLS_PATH = ROOT / "artifacts" / "tools.yaml"

system_prompt = SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")
tool_decls = load_tool_declarations(TOOLS_PATH)
openai_tools = to_openai_tools(tool_decls)

artifact_ver = build_artifact_version("v3", SYSTEM_PROMPT_PATH, TOOLS_PATH)

st.title("🛠️ IT Helpdesk Agent — Northstar Labs")
st.caption(f"Artifact Version Active: `{artifact_ver.artifact_version}`")

if "messages" not in st.session_state:
    st.session_state.messages = []

# Hiển thị lịch sử chat
for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])
        if "tools" in msg and msg["tools"]:
            with st.expander("🔍 Chi tiết Tool Calling Traces"):
                st.json(msg["tools"])

# Nhận câu hỏi mới
if prompt := st.chat_input("Nhập yêu cầu hỗ trợ IT..."):
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    provider = make_provider("gemini")
    chat_history = [{"role": "system", "content": system_prompt}]
    for m in st.session_state.messages:
        chat_history.append({"role": m["role"], "content": m["content"]})

    with st.chat_message("assistant"):
        with st.spinner("Agent đang xử lý và kích hoạt tools..."):
            result = run_model_tool_loop(
                provider=provider,
                messages=chat_history,
                tools=openai_tools,
                model=None,
                max_tool_rounds=4,
            )
            reply = result["assistant_text"]
            tool_events = result.get("tool_events", [])
            st.markdown(reply)
            if tool_events:
                with st.expander("🔍 Chi tiết Tool Calling Traces"):
                    st.json(tool_events)

    st.session_state.messages.append({
        "role": "assistant",
        "content": reply,
        "tools": tool_events,
    })