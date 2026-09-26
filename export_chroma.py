import chromadb
import json

DB_PATH = "backend/data/vectorstore"

client = chromadb.PersistentClient(path=DB_PATH)
collection = client.get_collection("langchain")

print("Total records:", collection.count())

data = collection.get(
    include=["documents", "metadatas", "embeddings"]
)

output = {
    "ids": data["ids"],
    "documents": data["documents"],
    "metadatas": data["metadatas"],
    "embeddings": data["embeddings"].tolist(),
}

with open("all_chroma_records.json", "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False)

print("Exported:", len(data["ids"]))
print("Saved to: all_chroma_records.json")