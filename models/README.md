# Models Directory for Local LLM (llama.cpp)

This directory stores your local IBM Granite GGUF model files.

### Configured Default Model:
- **`granite-4.2-3b-Q4_K_M.gguf`** (~2.09 GB)
- Hugging Face Repo: [ibm-granite/granite-4.2-3b-GGUF](https://huggingface.co/ibm-granite/granite-4.2-3b-GGUF)
- Direct Model Link: [granite-4.2-3b-Q4_K_M.gguf](https://huggingface.co/ibm-granite/granite-4.2-3b-GGUF/blob/main/granite-4.2-3b-Q4_K_M.gguf)

### Automatic Download via Docker Compose:
You do **not** need to manually download this model when setting up the project. 
The `llm-service` in `docker-compose.yml` is configured with:
```yaml
command: >
  --hf-repo ${LLM_HF_REPO:-ibm-granite/granite-4.2-3b-GGUF}
  --hf-file ${LLM_MODEL_FILE:-granite-4.2-3b-Q4_K_M.gguf}
```
When you run `docker compose up`, `llama.cpp` automatically downloads the model directly from Hugging Face into this `./models` directory and caches it for all subsequent runs.

### Manual Download (Optional Alternative):
If you prefer to download the model file manually ahead of time:
```bash
curl -L -o models/granite-4.2-3b-Q4_K_M.gguf "https://huggingface.co/ibm-granite/granite-4.2-3b-GGUF/resolve/main/granite-4.2-3b-Q4_K_M.gguf"
```
Once present in `./models`, `llama.cpp` will detect and load it immediately without downloading again.

