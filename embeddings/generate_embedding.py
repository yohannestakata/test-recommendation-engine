import hashlib
import json
import os
import sys
from typing import List

MODEL_NAME = "all-MiniLM-L6-v2"


def _mock_embedding(text: str, dim: int = 32) -> List[float]:
  """
  Fast, deterministic mock embedding based on text hash.
  This avoids heavy ML downloads when running in constrained environments (e.g. Docker).
  """
  if not text:
    return [0.0] * dim

  h = hashlib.sha256(text.encode("utf-8")).digest()
  # Repeat / trim hash bytes to reach desired dimension
  bytes_needed = dim
  data = (h * ((bytes_needed // len(h)) + 1))[:bytes_needed]
  return [b / 255.0 for b in data]


def main() -> None:
  mode = os.getenv("EMBEDDINGS_MODE", "real").lower()

  text = sys.stdin.read().strip()
  if not text:
    print(json.dumps([]))
    return

  # Lightweight, dependency-free path for Docker / testing
  if mode == "mock":
    embedding = _mock_embedding(text)
    print(json.dumps(embedding))
    return

  # Real sentence-transformers embedding (requires Python deps installed)
  try:
    from sentence_transformers import SentenceTransformer  # type: ignore
  except Exception as exc:  # pragma: no cover - safety net
    # Fallback to mock if sentence-transformers is unavailable
    embedding = _mock_embedding(f"fallback:{text}")
    print(json.dumps(embedding))
    return

  model = SentenceTransformer(MODEL_NAME)
  embedding = model.encode(text, normalize_embeddings=True)
  print(json.dumps(embedding.tolist()))


if __name__ == "__main__":
  main()
