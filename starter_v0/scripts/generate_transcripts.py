from __future__ import annotations

import json
from datetime import datetime
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from env_loader import load_lab_env
from providers import make_provider
from tools import load_tool_declarations, to_openai_tools
from versioning import build_artifact_version, artifact_version_dict
from chat import run_model_tool_loop, write_transcript, trim_history, now_iso
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass
load_lab_env(ROOT)


system_prompt_path = ROOT / "artifacts" / "system_prompt.md"
tools_path = ROOT / "artifacts" / "tools.yaml"
transcripts_dir = ROOT / "transcripts"

system_prompt = system_prompt_path.read_text(encoding="utf-8")
tool_declarations = load_tool_declarations(tools_path)
openai_tools = to_openai_tools(tool_declarations)
provider = make_provider("openai")
artifact_version = build_artifact_version("v3", system_prompt_path, tools_path)

scenarios = [
    {
        "id": "scenario_normal_flow",
        "title": "Normal Flow: Tra cứu Knowledge Base & Kiểm tra trạng thái VPN",
        "turns": [
            "Chào bạn, cho mình hỏi cách cấu hình Outlook profile trên Windows 11 với.",
            "Tiện thể kiểm tra luôn giúp mình trạng thái dịch vụ VPN production hiện tại thế nào.",
        ],
    },
    {
        "id": "scenario_missing_info",
        "title": "Missing Information Flow: Người dùng thiếu mã Asset ID -> Agent gọi clarify",
        "turns": [
            "Kiểm tra pin và kết nối Wi-Fi trên laptop của mình giúp với.",
            "Mã máy của mình là LT-204, bạn kiểm tra giúp mình nhé.",
        ],
    },
    {
        "id": "scenario_multiturn_correction",
        "title": "Multi-turn Correction: Người dùng đổi thiết bị và dịch vụ cần kiểm tra",
        "turns": [
            "Kiểm tra giúp mình máy LT-204 về VPN.",
            "À nhầm, kiểm tra máy LT-318 mới đúng. Đồng thời kiểm tra luôn dịch vụ VPN production nhé.",
        ],
    },
    {
        "id": "scenario_action_boundary",
        "title": "Action Boundary: Tạo ticket cần xác nhận rõ ràng trước khi ghi",
        "turns": [
            "Tạo ticket sự cố lỗi VPN trên máy LT-204 mức priority high giúp mình.",
            "Đúng rồi, mình xác nhận nội dung đó, bạn tạo ticket giúp mình.",
        ],
    },
]

def run_scenarios():
    print(f"Generating transcripts using artifact_version={artifact_version.artifact_version}...")
    for sc in scenarios:
        timestamp = datetime.now().strftime("%Y%m%dT%H%M%S%f")
        transcript_id = f"v3_openai_{sc['id']}_{timestamp}"
        transcript_path = transcripts_dir / f"{transcript_id}.transcript.json"
        
        transcript = {
            "transcript_id": transcript_id,
            "scenario_title": sc["title"],
            **artifact_version_dict(artifact_version),
            "provider": "openai",
            "model": getattr(provider, "default_model", None),
            "system_prompt": str(system_prompt_path),
            "tools": str(tools_path),
            "history_window": 5,
            "max_tool_rounds": 4,
            "created_at": now_iso(),
            "updated_at": now_iso(),
            "turns": [],
        }
        
        history = []
        turn_index = 0
        for user_text in sc["turns"]:
            turn_index += 1
            messages = [
                {"role": "system", "content": system_prompt},
                *trim_history(history, 5),
                {"role": "user", "content": user_text},
            ]
            
            turn_record = {
                "turn_index": turn_index,
                "started_at": now_iso(),
                "user": user_text,
                "status": "started",
                "assistant_text": None,
                "rounds": [],
                "tool_events": [],
            }
            
            result = run_model_tool_loop(
                provider=provider,
                messages=messages,
                tools=openai_tools,
                model=None,
                max_tool_rounds=4,
            )
            turn_record.update(result)
            turn_record["ended_at"] = now_iso()
            transcript["turns"].append(turn_record)
            
            assistant_text = result.get("assistant_text", "")
            history.append({"role": "user", "content": user_text})
            history.append({"role": "assistant", "content": assistant_text})
            print(f"[{sc['id']}] Turn {turn_index}: User='{user_text}' -> Status='{result['status']}'")
            
        write_transcript(transcript_path, transcript)
        print(f"Saved: {transcript_path}\n")

if __name__ == "__main__":
    run_scenarios()
