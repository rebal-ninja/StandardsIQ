import chromadb
from pathlib import Path

client = chromadb.PersistentClient(
    path=str(Path("backend/data/vectorstore"))
)

collection = client.get_collection("langchain")

queries = [
    "IS 9079:1979",
    "IS 4148:1980",
    "IS 4770:1991",
    "IS 10322 Part 5 Section 3 2013",
    "IS 16107:2012",
    "IS 2062:2011",
]

print(f"Total documents: {collection.count()}")

for query in queries:
    print("\n" + "=" * 100)
    print(f"QUERY: {query}")
    print("=" * 100)python ".\check rec.py"

    results = collection.query(
        query_texts=[query],
        n_results=5,
        include=["documents", "metadatas", "distances"]
    )

    for rank in range(len(results["ids"][0])):
        print(f"\n#{rank + 1}")
        print("Chroma ID :", results["ids"][0][rank])
        print("Distance  :", results["distances"][0][rank])

        print("\nMetadata:")
        for key, value in results["metadatas"][0][rank].items():
            print(f"  {key}: {value}")

        print("\nDocument:")
        print(results["documents"][0][rank][:1000])