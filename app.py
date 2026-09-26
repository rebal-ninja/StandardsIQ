import streamlit as st
import time
import json
import os
from dotenv import load_dotenv
from src.rag_pipeline import BISRAGPipeline

# Load environment variables from .env
load_dotenv()

# Page configuration for a professional look
st.set_page_config(
    page_title="StandardsIQ",
    page_icon="🏗️",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom Styling for "Premium" feel
st.markdown("""
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
    
    html, body, [class*="css"] {
        font-family: 'Inter', sans-serif;
    }
    
    .main-header {
        font-size: 2.5rem;
        font-weight: 700;
        color: #1E88E5;
        margin-bottom: 0.5rem;
    }
    
    .sub-header {
        font-size: 1.1rem;
        color: #616161;
        margin-bottom: 2rem;
    }
    
    .stTextArea textarea {
        border-radius: 10px;
        border: 1px solid #E0E0E0;
    }
    
    .standard-card {
        background-color: #F8F9FA;
        padding: 1.5rem;
        border-radius: 12px;
        border-left: 6px solid #1E88E5;
        margin-bottom: 1.2rem;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    
    .standard-id {
        font-weight: 700;
        color: #1565C0;
        font-size: 1.2rem;
        margin-bottom: 0.5rem;
    }
    
    .rationale-text {
        color: #424242;
        line-height: 1.5;
    }
    
    .metric-box {
        background-color: #E3F2FD;
        padding: 0.5rem 1rem;
        border-radius: 8px;
        font-weight: 600;
        color: #1E88E5;
        display: inline-block;
        margin-bottom: 1rem;
    }
    </style>
    """, unsafe_allow_html=True)

# Sidebar with Hackathon Info
with st.sidebar:
    st.markdown("## 🏗️ BIS Discovery")
    st.markdown("---")
    st.markdown("### Hackathon Details")
    st.info("**Track:** AI / RAG\n\n**Theme:** Accelerating MSE Compliance\n\n**Category:** Building Materials")
    st.divider()
    st.markdown("### System Architecture")
    st.write("- **Retriever:** ChromaDB")
    st.write("- **Embeddings:** all-MiniLM-L6-v2")
    st.write("- **LLM:** Llama 3.1 (Groq)")

# Main UI
st.markdown('<div class="main-header">🏗️ BIS Standard Discovery</div>', unsafe_allow_html=True)
st.markdown('<div class="sub-header">AI-Powered Recommendation Engine for Indian Building Material Standards</div>', unsafe_allow_html=True)

# Initialize Pipeline
if 'pipeline' not in st.session_state:
    with st.spinner("Initializing AI Retrieval Engine..."):
        try:
            # Ensure the API key is set in the environment for the session
            os.environ["GROQ_API_KEY"] = os.getenv("GROQ_API_KEY")
            st.session_state.pipeline = BISRAGPipeline()
            # Pre-warm retriever to avoid cold-start latency on first user query
            st.session_state.pipeline.warm_up_retriever()
        except Exception as e:
            st.error(f"Failed to initialize engine: {e}")

col1, col2 = st.columns([1, 1.2], gap="large")

with col1:
    st.markdown("### 📝 Product Input")
    st.write("Enter your product description or specifications below to find matching standards.")
    
    description = st.text_area(
        "",
        placeholder="Example: We manufacture 43 Grade Ordinary Portland Cement for structural use in high-rise buildings...",
        height=250
    )
    
    find_btn = st.button("🚀 Discover Standards", use_container_width=True)

with col2:
    st.markdown("### 📋 Recommended Standards")
    
    if find_btn and description:
        with st.spinner("Analyzing standards from BIS SP 21..."):
            start_time = time.time()
            recommendations = st.session_state.pipeline.get_recommendations(description)
            latency = time.time() - start_time
            
            if recommendations:
                # Show which path produced the recommendation if available
                match_info = getattr(st.session_state.pipeline, "last_fallback", None)
                if match_info:
                    st.info(f"Matched by: {match_info}")
                else:
                    st.info("Matched by: Retriever + LLM")
                st.markdown(f'<div class="metric-box">⏱️ Latency: {latency:.2f} seconds</div>', unsafe_allow_html=True)
                for rec in recommendations:
                    title = rec.get('title', '')
                    domain = rec.get('domain', '')
                    status = rec.get('status', '')
                    year = rec.get('year', '')
                    revision = rec.get('revision', '')
                    source = rec.get('source', '')
                    scope = rec.get('scope', '')
                    sim = rec.get('similarity_score')

                    # Build subtitle line
                    meta_parts = []
                    if domain:
                        meta_parts.append(f"Domain: {domain}")
                    if status:
                        meta_parts.append(f"Status: {status.capitalize()}")
                    if year:
                        meta_parts.append(f"Year: {year}")
                    if revision:
                        meta_parts.append(f"Revision: {revision}")
                    if sim is not None:
                        meta_parts.append(f"Similarity: {sim:.4f}")
                    meta_line = " &nbsp;|&nbsp; ".join(meta_parts) if meta_parts else ""

                    scope_html = f'<div class="rationale-text" style="color:#555;font-size:0.88em;margin-top:0.3rem;"><b>Scope:</b> {scope}</div>' if scope else ""
                    source_html = f'<div style="color:#888;font-size:0.8em;margin-top:0.2rem;">Source: {source}</div>' if source else ""

                    st.markdown(f"""
                        <div class="standard-card">
                            <div class="standard-id">📄 {rec['standard_id']}</div>
                            {f'<div style="font-weight:600;color:#333;margin-bottom:0.3rem;">{title}</div>' if title else ''}
                            {f'<div style="font-size:0.85em;color:#666;margin-bottom:0.5rem;">{meta_line}</div>' if meta_line else ''}
                            <div class="rationale-text"><b>Rationale:</b> {rec['rationale']}</div>
                            {scope_html}
                            {source_html}
                        </div>
                        """, unsafe_allow_html=True)
            else:
                st.warning("No confident match found for this requirement. Consider refining the description or checking a broader category.")
    elif not description:
        st.info("👈 Enter a product description on the left to start the discovery process.")
    else:
        st.write("Click 'Discover Standards' to see results here.")

st.divider()
st.caption("Developed for the MSE Compliance Hackathon • Source: BIS SP 21 (Summaries of Indian Standards for Building Materials)")
