import chromadb
import json

# ============================================================
# CONFIGURATION
# ============================================================

DB_PATH = "backend/data/vectorstore"
COLLECTION_NAME = "langchain"

# ============================================================
# CONNECT TO CHROMADB
# ============================================================

print("=" * 100)
print("CONNECTING TO CHROMADB")
print("=" * 100)

client = chromadb.PersistentClient(path=DB_PATH)

collection = client.get_collection(COLLECTION_NAME)

total = collection.count()

print(f"\nDatabase: {DB_PATH}")
print(f"Collection: {COLLECTION_NAME}")
print(f"Total records: {total}")

# ============================================================
# FETCH ALL RECORDS
# ============================================================

print("\nFetching all records...")

data = collection.get(
    include=[
        "documents",
        "metadatas",
        "embeddings"
    ]
)

print(f"Fetched {len(data['ids'])} records.")

# ============================================================
# OPEN OUTPUT FILE
# ============================================================

output_file = "all_standards.txt"

with open(output_file, "w", encoding="utf-8") as file:

    # ========================================================
    # HEADER
    # ========================================================

    header = f"""
{'=' * 100}
CHROMADB COMPLETE STANDARDS DATABASE
{'=' * 100}

Database:
{DB_PATH}

Collection:
{COLLECTION_NAME}

Total Records:
{total}

{'=' * 100}
"""

    print(header)
    file.write(header)

    # ========================================================
    # PRINT EVERY RECORD
    # ========================================================

    for i in range(len(data["ids"])):

        record_number = i + 1

        separator = "\n" + "=" * 100 + "\n"

        title = f"RECORD {record_number} / {total}"

        print(separator)
        print(title)
        print(separator)

        file.write(separator)
        file.write(title + "\n")
        file.write(separator)

        # ----------------------------------------------------
        # CHROMA ID
        # ----------------------------------------------------

        chroma_id = data["ids"][i]

        text = f"""
CHROMA ID:
{chroma_id}
"""

        print(text)
        file.write(text)

        # ----------------------------------------------------
        # METADATA / FIELDS
        # ----------------------------------------------------

        metadata = data["metadatas"][i]

        print("FIELDS / METADATA:")
        file.write("FIELDS / METADATA:\n")

        if metadata:

            for field, value in metadata.items():

                field_text = f"""
  FIELD:
    {field}

  VALUE:
    {value}
"""

                print(field_text)
                file.write(field_text)

        else:

            print("  No metadata available.")
            file.write("  No metadata available.\n")

        # ----------------------------------------------------
        # DOCUMENT / DESCRIPTION
        # ----------------------------------------------------

        document = data["documents"][i]

        document_text = f"""
DOCUMENT / DESCRIPTION:
{document if document else "No document text available."}
"""

        print(document_text)
        file.write(document_text)

        # ----------------------------------------------------
        # EMBEDDING
        # ----------------------------------------------------

        embedding = data["embeddings"][i]

        print("\nEMBEDDING:")
        file.write("\nEMBEDDING:\n")

        if embedding is not None:

            # Convert NumPy array to normal Python list
            embedding_list = embedding.tolist()

            print(embedding_list)
            file.write(json.dumps(embedding_list))

        else:

            print("No embedding available.")
            file.write("No embedding available.")

        # ----------------------------------------------------
        # FLUSH FILE
        # ----------------------------------------------------

        file.flush()

    # ========================================================
    # FINISHED
    # ========================================================

    ending = f"""

{'=' * 100}
INSPECTION COMPLETE
{'=' * 100}

Total records processed: {total}

Output file:
{output_file}

{'=' * 100}
"""

    print(ending)
    file.write(ending)

print(f"\nComplete output saved to: {output_file}")