from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

import streamlit as st

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from env_loader import load_lab_env
from providers import make_provider
from tools import load_tool_declarations, to_openai_tools
from versioning import build_artifact_version, artifact_version_dict
from chat import run_model_tool_loop, trim_history, now_iso

load_lab_env(ROOT)

# Page configuration
st.set_page_config(
    page_title="Northstar Labs IT Helpdesk Agent",
    page_icon="🛠️",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Custom Styling
st.markdown(
    """
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
    
    html, body, [class*="css"] {
        font-family: 'Inter', sans-serif;
    }
    
    .main-title {
        font-size: 2.2rem;
        font-weight: 700;
        background: linear-gradient(90deg, #6366f1 0%, #a855f7 50%, #ec4899 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin-bottom: 0.2rem;
    }
    
    .sub-title {
        color: #94a3b8;
        font-size: 0.95rem;
        margin-bottom: 1.5rem;
    }
    
    .badge-version {
        display: inline-block;
        background: rgba(99, 102, 241, 0.15);
        color: #818cf8;
        border: 1px solid rgba(99, 102, 241, 0.3);
        border-radius: 9999px;
        padding: 0.25rem 0.75rem;
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.8rem;
        font-weight: 500;
        margin-bottom: 1rem;
    }
    
    .tool-card {
        background: rgba(30, 41, 59, 0.7);
        border: 1px solid rgba(148, 163, 184, 0.15);
        border-radius: 0.5rem;
        padding: 0.75rem 1rem;
        margin: 0.5rem 0;
    }
    
    .tool-badge {
        background: #312e81;
        color: #c7d2fe;
        border-radius: 0.375rem;
        padding: 0.2rem 0.5rem;
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.8rem;
        font-weight: 600;
    }
    
    .status-badge {
        padding: 0.15rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
    }
    
    .status-success {
        background: rgba(34, 197, 94, 0.2);
        color: #4ade80;
        border: 1px solid rgba(34, 197, 94, 0.3);
    }
    
    .status-waiting {
        background: rgba(234, 179, 8, 0.2);
        color: #facc15;
        border: 1px solid rgba(234, 179, 8, 0.3);
    }
    </style>
    """,
    unsafe_allow_html=True,
)

# Initialize Session State
if "messages" not in st.session_state:
    st.session_state.messages = []
if "history" not in st.session_state:
    st.session_state.history = []
if "turn_records" not in st.session_state:
    st.session_state.turn_records = []

# Paths
system_prompt_path = ROOT / "artifacts" / "system_prompt.md"
tools_path = ROOT / "artifacts" / "tools.yaml"

# Load artifacts
system_prompt = system_prompt_path.read_text(encoding="utf-8")
tool_declarations = load_tool_declarations(tools_path)
openai_tools = to_openai_tools(tool_declarations)
artifact_version = build_artifact_version("v3", system_prompt_path, tools_path)

# Sidebar
with st.sidebar:
    st.markdown("### 🏢 Northstar Labs IT Service Desk")
    st.markdown(f"<div class='badge-version'>Artifact: {artifact_version.artifact_version}</div>", unsafe_allow_html=True)
    
    st.markdown("#### ⚙️ Runtime Settings")
    provider_name = st.selectbox("Provider", ["openai", "openrouter", "anthropic", "gemini"], index=0)
    provider = make_provider(provider_name)
    model_name = getattr(provider, "default_model", "cx/gpt-5.5")
    st.text_input("Active Model", value=model_name, disabled=True)
    
    history_window = st.slider("Context History Window (turns)", min_value=1, max_value=10, value=5)
    max_tool_rounds = st.slider("Max Tool Rounds", min_value=1, max_value=6, value=4)
    
    st.divider()
    
    st.markdown("#### 🔍 Artifacts Audit")
    with st.expander("System Prompt (v3)"):
        st.code(system_prompt, language="markdown")
    with st.expander("Tool Declarations (tools.yaml)"):
        st.code(tools_path.read_text(encoding="utf-8"), language="yaml")
        
    st.divider()
    
    if st.button("🧹 Xóa hội thoại (Reset Chat)", use_container_width=True):
        st.session_state.messages = []
        st.session_state.history = []
        st.session_state.turn_records = []
        st.rerun()

# Main Interface
st.markdown("<div class='main-title'>IT Helpdesk AI Assistant</div>", unsafe_allow_html=True)
st.markdown("<div class='sub-title'>Hệ thống trợ lý dịch vụ IT nội bộ thông minh có kiểm soát ranh giới dữ liệu và xác nhận an toàn</div>", unsafe_allow_html=True)

# Quick Prompts
st.markdown("**Gợi ý tình huống mẫu:**")
col1, col2, col3, col4 = st.columns(4)
quick_input = None
with col1:
    if st.button("🌐 Kiểm tra VPN production", use_container_width=True):
        quick_input = "Dịch vụ VPN production hiện có đang gặp sự cố không?"
with col2:
    if st.button("💻 Chẩn đoán máy LT-204", use_container_width=True):
        quick_input = "Kiểm tra tổng thể laptop LT-204 giúp mình."
with col3:
    if st.button("📖 Hướng dẫn Outlook Win 11", use_container_width=True):
        quick_input = "Tìm hướng dẫn cấu hình Outlook profile trên Windows 11."
with col4:
    if st.button("🎫 Yêu cầu tạo Ticket", use_container_width=True):
        quick_input = "Tạo ticket mức high cho lỗi VPN trên LT-204 giúp mình."

# Display message history
for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])
        if "tool_events" in msg and msg["tool_events"]:
            with st.expander(f"🛠️ Đã thực thi {len(msg['tool_events'])} tool call(s)", expanded=False):
                for ev in msg["tool_events"]:
                    st.markdown(f"<span class='tool-badge'>{ev.get('tool')}</span>", unsafe_allow_html=True)
                    st.json({"args": ev.get("args"), "result": ev.get("result")})

# Handle user input
user_input = st.chat_input("Nhập câu hỏi hoặc yêu cầu hỗ trợ IT...") or quick_input

if user_input:
    # Append user message
    st.session_state.messages.append({"role": "user", "content": user_input})
    with st.chat_message("user"):
        st.markdown(user_input)
        
    # Build messages with system prompt & history
    trimmed = trim_history(st.session_state.history, history_window)
    working_messages = [
        {"role": "system", "content": system_prompt},
        *trimmed,
        {"role": "user", "content": user_input},
    ]
    
    turn_record = {
        "turn_index": len(st.session_state.turn_records) + 1,
        "started_at": now_iso(),
        "user": user_input,
        "status": "started",
        "assistant_text": None,
        "rounds": [],
        "tool_events": [],
    }
    
    with st.chat_message("assistant"):
        with st.spinner("Đang phân tích và xử lý yêu cầu qua tool loop..."):
            result = run_model_tool_loop(
                provider=provider,
                messages=working_messages,
                tools=openai_tools,
                model=None,
                max_tool_rounds=max_tool_rounds,
            )
            turn_record.update(result)
            turn_record["ended_at"] = now_iso()
            st.session_state.turn_records.append(turn_record)
            
            assistant_text = result.get("assistant_text", "")
            tool_events = result.get("tool_events", [])
            status = result.get("status", "answered")
            
            # Display tools if any
            if tool_events:
                status_class = "status-waiting" if status == "waiting_for_user" else "status-success"
                st.markdown(f"<span class='status-badge {status_class}'>{status}</span>", unsafe_allow_html=True)
                with st.expander(f"🛠️ Chi tiết {len(tool_events)} tool call(s)", expanded=True):
                    for ev in tool_events:
                        st.markdown(f"<span class='tool-badge'>{ev.get('tool')}</span>", unsafe_allow_html=True)
                        st.json({"args": ev.get("args"), "result": ev.get("result")})
            
            st.markdown(assistant_text)
            
            # Update chat history
            st.session_state.messages.append({
                "role": "assistant",
                "content": assistant_text,
                "tool_events": tool_events,
            })
            st.session_state.history.append({"role": "user", "content": user_input})
            st.session_state.history.append({"role": "assistant", "content": assistant_text})

# Transcript Export Option
if st.session_state.turn_records:
    st.divider()
    transcript_payload = {
        "transcript_id": f"streamlit_{now_iso()}",
        **artifact_version_dict(artifact_version),
        "provider": provider_name,
        "model": model_name,
        "history_window": history_window,
        "max_tool_rounds": max_tool_rounds,
        "turns": st.session_state.turn_records,
    }
    st.download_button(
        label="📥 Tải xuống Session Transcript JSON",
        data=json.dumps(transcript_payload, ensure_ascii=False, indent=2),
        file_name=f"transcript_session_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json",
        mime="application/json",
        use_container_width=True,
    )
