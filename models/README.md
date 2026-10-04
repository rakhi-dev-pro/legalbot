# Models Directory for Local LLM (llama.cpp)

This directory stores your local IBM Granite GGUF model files.

### 1. Active Model in `./models/`
- **`granite-4.2-3b-Q4_K_M.gguf`** (~2.1 GB / `2,244,011,552` bytes) — **Default Model**
- Hugging Face Repo: [ibm-granite/granite-4.2-3b-GGUF](https://huggingface.co/ibm-granite/granite-4.2-3b-GGUF)
- Direct Download URL: `https://huggingface.co/ibm-granite/granite-4.2-3b-GGUF/resolve/main/granite-4.2-3b-Q4_K_M.gguf?download=true`

### 2. Downloading the Model Manually
In GitHub Codespaces or any environment with restricted container egress:
```bash
# Using wget:
wget -c "https://huggingface.co/ibm-granite/granite-4.2-3b-GGUF/resolve/main/granite-4.2-3b-Q4_K_M.gguf?download=true" -O models/granite-4.2-3b-Q4_K_M.gguf

# Or using curl:
curl -C - -L "https://huggingface.co/ibm-granite/granite-4.2-3b-GGUF/resolve/main/granite-4.2-3b-Q4_K_M.gguf?download=true" -o models/granite-4.2-3b-Q4_K_M.gguf
```

### 3. Troubleshooting Corrupted or Truncated Files
If `llama-server` logs `tensor 'blk.32.ffn_down.weight' data is not within the file bounds, model is corrupted or incomplete`:
1. Check the file size:
   ```bash
   ls -lh models/granite-4.2-3b-Q4_K_M.gguf
   ```
2. If the size is less than ~2.1 GB (2,244,011,552 bytes), the download was cut off midway.
3. Remove the incomplete file and re-download:
   ```bash
   rm -f models/granite-4.2-3b-Q4_K_M.gguf
   wget -c "https://huggingface.co/ibm-granite/granite-4.2-3b-GGUF/resolve/main/granite-4.2-3b-Q4_K_M.gguf?download=true" -O models/granite-4.2-3b-Q4_K_M.gguf
   ```

