# Models Directory for Local LLM (llama.cpp)

This directory stores your local IBM Granite GGUF model files.

### 1. Active Model in `./models/`
- **`granite-4.1-3b-Q6_K.gguf`** (2.79 GB) — **Currently installed and configured**
- Runs completely offline in Docker Compose via:
  ```yaml
  --model /models/${LLM_MODEL_FILE:-granite-4.1-3b-Q6_K.gguf}
  ```

---

### 2. Upgrading to Granite 4.2 (`granite-4.2-3b-Q4_K_M.gguf`)
If you want to use **Granite 4.2 3B**:
- **Direct Download Link**: [granite-4.2-3b-Q4_K_M.gguf](https://huggingface.co/ibm-granite/granite-4.2-3b-GGUF/resolve/main/granite-4.2-3b-Q4_K_M.gguf) (~2.09 GB)
- Download using terminal:
  ```bash
  curl.exe -L -o models/granite-4.2-3b-Q4_K_M.gguf "https://huggingface.co/ibm-granite/granite-4.2-3b-GGUF/resolve/main/granite-4.2-3b-Q4_K_M.gguf"
  ```
- In `.env`, set:
  ```env
  LLM_MODEL_FILE=granite-4.2-3b-Q4_K_M.gguf
  ```

> **Note on Docker / Codespaces**: Docker containers do not download models dynamically on startup because container egress to Hugging Face may fail (`HTTPLIB failed: Could not establish connection`). The GGUF file must reside locally in this `./models/` directory, which is mounted into the container at `/models`.

