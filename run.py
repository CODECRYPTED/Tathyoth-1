import os
import sys
import webbrowser

# Add backend directory to sys.path
backend_dir = os.path.join(os.path.dirname(__file__), "backend")
sys.path.insert(0, backend_dir)

if __name__ == "__main__":
    os.chdir(backend_dir)
    import uvicorn
    
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 8000))
    is_prod = os.getenv("PORT") is not None
    url = f"http://localhost:{port}"
    print("=" * 60)
    print("  TATHYOTH: Kisne kaha, saboot kahan hai?")
    print("  Full-Fledged Fact-Checking & Search Platform")
    print(f"  Live at: {url}")
    print("=" * 60)
    
    uvicorn.run("server:app", host=host, port=port, reload=not is_prod)
