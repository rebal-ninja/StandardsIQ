import os
import fitz  # PyMuPDF
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings
from tqdm import tqdm

def ingest_pdf(pdf_path, storage_path):
    print(f"Starting ingestion for {pdf_path}...")
    
    # 1. Load PDF and extract text with metadata
    doc = fitz.open(pdf_path)
    documents = []
    
    for page_num in tqdm(range(len(doc)), desc="Reading PDF"):
        page = doc.load_page(page_num)
        text = page.get_text("text")
        
        # Basic cleaning
        text = text.replace('\n', ' ').strip()
        
        if text:
            documents.append({
                "page_content": text,
                "metadata": {"page": page_num + 1, "source": pdf_path}
            })
    
    print(f"Extracted {len(documents)} pages.")

    # 2. Chunking
    # We use a relatively small chunk size to capture specific standard details
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        separators=["\n\n", "\n", ".", " ", ""]
    )
    
    all_chunks = []
    for doc_item in documents:
        chunks = text_splitter.split_text(doc_item["page_content"])
        for chunk in chunks:
            all_chunks.append({
                "page_content": chunk,
                "metadata": doc_item["metadata"]
            })
            
    print(f"Created {len(all_chunks)} chunks.")

    # 3. Embeddings and Vector Store
    # all-MiniLM-L6-v2 is fast and effective for local use
    print("Initializing embeddings model...")
    embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    
    print("Creating vector store (this might take a few minutes)...")
    texts = [c["page_content"] for c in all_chunks]
    metadatas = [c["metadata"] for c in all_chunks]
    
    vectorstore = Chroma.from_texts(
        texts=texts,
        embedding=embeddings,
        metadatas=metadatas,
        persist_directory=storage_path
    )
    
    # vectorstore.persist()  # Chroma 0.4+ persists automatically on construction
    print(f"Vector store saved to {storage_path}")

if __name__ == "__main__":
    PDF_PATH = "dataset.pdf"
    STORAGE_PATH = "data/vectorstore"
    
    if not os.path.exists(PDF_PATH):
        print(f"Error: {PDF_PATH} not found!")
    else:
        ingest_pdf(PDF_PATH, STORAGE_PATH)
