from flask import Flask, request, jsonify, send_file, send_from_directory, session
from flask_cors import CORS
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
import os
import openai
from openai import OpenAI  # Update this import
from werkzeug.utils import secure_filename
import subprocess
import tempfile
import logging
import re
import json
import secrets  # Add this import
import shutil
import traceback
from werkzeug.utils import secure_filename
import base64
from PIL import Image
import io

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv("SECRET_KEY") or secrets.token_hex(16)  # Use this line
app.config['SESSION_TYPE'] = 'filesystem'  # Add this line
CORS(app, supports_credentials=True)  # Update this line

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'  # Add this line

# Initialize OpenAI client
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))  # Update this line

# User model
class User(UserMixin):
    def __init__(self, id, username, password):
        self.id = id
        self.username = username
        self.password = password

# File-based user storage
USER_FILE = 'users.json'

def save_users(users):
    with open(USER_FILE, 'w') as f:
        json.dump(users, f)

def load_users():
    if os.path.exists(USER_FILE):
        with open(USER_FILE, 'r') as f:
            return json.load(f)
    return {}

users = load_users()

@login_manager.user_loader
def load_user(user_id):
    user_data = users.get(user_id)
    if user_data:
        return User(id=user_id, username=user_data['username'], password=user_data['password'])
    return None

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    if username in users:
        return jsonify({"error": "Username already exists"}), 400
    hashed_password = generate_password_hash(password)
    users[username] = {'username': username, 'password': hashed_password}
    save_users(users)
    return jsonify({"message": "User registered successfully"}), 201

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    user_data = users.get(username)
    if user_data and check_password_hash(user_data['password'], password):
        user = User(id=username, username=username, password=user_data['password'])
        login_user(user)
        return jsonify({"message": "Logged in successfully"}), 200
    return jsonify({"error": "Invalid username or password"}), 401

@app.route('/api/logout', methods=['POST'])
@login_required
def logout():
    logout_user()
    return jsonify({"message": "Logged out successfully"}), 200

# Modify existing routes to use user-specific directories
def get_user_dir():
    return os.path.join(os.getcwd(), 'user_documents', current_user.id)

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def sanitize_input(input_string):
    # Remove any potentially dangerous LaTeX commands
    dangerous_commands = ['\\input', '\\include', '\\write18', '\\immediate', '\\verbatiminput']
    for command in dangerous_commands:
        input_string = input_string.replace(command, '')
    # Escape special characters
    input_string = re.sub(r'([&%$#_{}])', r'\\\1', input_string)
    return input_string

@app.route('/api/process_input', methods=['POST'])
@login_required
def process_input():
    user_input = request.json.get('input')
    if not user_input:
        return jsonify({"error": "No input provided"}), 400

    try:
        sanitized_input = sanitize_input(user_input)
        logger.info(f"Generating LaTeX for sanitized input: {sanitized_input}")
        
        logger.info(f"OpenAI API Key: {client.api_key[:5]}...")  # Only log the first 5 characters for security

        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are a LaTeX expert. Generate LaTeX content for the given instructions. Do not include \\documentclass, \\begin{document}, or \\end{document}. Focus only on the content."},
                {"role": "user", "content": f"Generate LaTeX content for the following instruction:\n{sanitized_input}"}
            ],
            max_tokens=1000,
            temperature=0.7,
        )
        latex_content = response.choices[0].message.content.strip()
        
        # Replace filenames with safe versions in the generated LaTeX content
        user_upload_folder = os.path.join(app.config['UPLOAD_FOLDER'], current_user.id)
        for filename in os.listdir(user_upload_folder):
            if allowed_file(filename):
                safe_filename = re.sub(r'[^a-zA-Z0-9_.-]', '_', filename)
                latex_content = latex_content.replace(filename, safe_filename)
        
        # Wrap the generated content in a complete LaTeX document structure
        latex_code = f"""
\\documentclass{{article}}
\\usepackage{{amsmath}}
\\usepackage{{amssymb}}
\\usepackage{{graphicx}}
\\usepackage{{hyperref}}
\\usepackage[utf8]{{inputenc}}

\\title{{Generated LaTeX Document}}
\\author{{AI Assistant}}
\\date{{\\today}}

\\begin{{document}}

\\maketitle

{latex_content}

\\end{{document}}
"""
        
        # Log the generated LaTeX code for debugging
        logger.info(f"Generated LaTeX code:\n{latex_code}")

        if latex_code:
            user_dir = get_user_dir()
            os.makedirs(user_dir, exist_ok=True)
            with open(os.path.join(user_dir, 'main.tex'), 'w') as file:
                file.write(latex_code)
            logger.info(f"LaTeX file written successfully")
            return jsonify({"latex_code": latex_code})
        else:
            logger.error("Failed to generate LaTeX code")
            return jsonify({"error": "Failed to generate LaTeX code"}), 500
    except Exception as e:
        logger.error(f"Error processing input: {str(e)}")
        return jsonify({"error": f"Error processing input: {str(e)}"}), 500

def clean_latex_code(latex_code):
    # Remove any content before \documentclass and after \end{document}
    latex_code = re.sub(r'^.*?\\documentclass', r'\\documentclass', latex_code, flags=re.DOTALL)
    latex_code = re.sub(r'\\end\{document\}.*$', r'\\end{document}', latex_code, flags=re.DOTALL)
    
    # Remove duplicate package declarations
    packages = set()
    def replace_package(match):
        package = match.group(3)
        if package in packages:
            return ''
        packages.add(package)
        return match.group(0)
    latex_code = re.sub(r'(\\usepackage(\[.*?\])?\{(.*?)\})', replace_package, latex_code)
    
    # Ensure there's only one \begin{document} and \end{document}
    latex_code = re.sub(r'\\begin\{document\}.*?\\end\{document\}', lambda m: m.group(0), latex_code, flags=re.DOTALL)
    
    return latex_code.strip()

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/api/upload', methods=['POST'])
@login_required
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        user_upload_folder = os.path.join(app.config['UPLOAD_FOLDER'], current_user.id)
        os.makedirs(user_upload_folder, exist_ok=True)
        file_path = os.path.join(user_upload_folder, filename)
        file.save(file_path)
        return jsonify({"message": "File uploaded successfully", "path": file_path}), 200
    return jsonify({"error": "File type not allowed"}), 400

@app.route('/api/files', methods=['GET'])
@login_required
def get_files():
    user_upload_folder = os.path.join(app.config['UPLOAD_FOLDER'], current_user.id)
    files = []
    if os.path.exists(user_upload_folder):
        files = os.listdir(user_upload_folder)
    return jsonify({"files": files}), 200

@app.route('/api/delete_file/<filename>', methods=['DELETE'])
@login_required
def delete_file(filename):
    user_upload_folder = os.path.join(app.config['UPLOAD_FOLDER'], current_user.id)
    file_path = os.path.join(user_upload_folder, filename)
    if os.path.exists(file_path):
        os.remove(file_path)
        return jsonify({"message": f"File {filename} deleted successfully"}), 200
    else:
        return jsonify({"error": "File not found"}), 404

@app.route('/api/file_content/<filename>', methods=['GET'])
@login_required
def get_file_content(filename):
    user_upload_folder = os.path.join(app.config['UPLOAD_FOLDER'], current_user.id)
    file_path = os.path.join(user_upload_folder, filename)
    if os.path.exists(file_path):
        with open(file_path, 'r') as file:
            content = file.read()
        return jsonify({"content": content}), 200
    else:
        return jsonify({"error": "File not found"}), 404

@app.route('/api/compile_latex', methods=['POST'])
@login_required
def compile_latex():
    latex_code = request.json.get('latex')
    if not latex_code:
        return jsonify({"error": "No LaTeX code provided"}), 400

    user_dir = get_user_dir()
    os.makedirs(user_dir, exist_ok=True)
    
    # Copy all image files from the user's upload folder to the LaTeX compilation directory
    user_upload_folder = os.path.join(app.config['UPLOAD_FOLDER'], current_user.id)
    for filename in os.listdir(user_upload_folder):
        if allowed_file(filename):
            safe_filename = secure_filename(filename)
            shutil.copy(os.path.join(user_upload_folder, filename), os.path.join(user_dir, safe_filename))
            # Replace the original filename with the safe filename in the LaTeX code
            latex_code = latex_code.replace(filename, safe_filename)

    with open(os.path.join(user_dir, 'main.tex'), 'w') as f:
        f.write(latex_code)

    try:
        logger.info(f"Compiling LaTeX in directory: {user_dir}")
        
        if shutil.which('pdflatex') is None:
            logger.error("pdflatex is not installed or not in PATH")
            return jsonify({"error": "LaTeX compiler (pdflatex) is not installed on the server. Please contact the administrator."}), 500

        result = subprocess.run(
            ['pdflatex', '-interaction=nonstopmode', 'main.tex'],
            cwd=user_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        logger.info(f"pdflatex return code: {result.returncode}")
        logger.info(f"pdflatex stdout: {result.stdout}")
        logger.info(f"pdflatex stderr: {result.stderr}")
        
        if result.returncode != 0:
            error_message = extract_latex_error(result.stdout)
            logger.error(f"LaTeX compilation error: {error_message}")
            return jsonify({"error": f"LaTeX compilation error: {error_message}"}), 500

        logger.info("PDF compiled successfully")
        pdf_path = os.path.join(user_dir, 'main.pdf')
        if os.path.exists(pdf_path):
            logger.info(f"PDF file found at: {pdf_path}")
            return jsonify({"message": "PDF compiled successfully", "pdf_path": "main.pdf"})
        else:
            logger.error(f"PDF file not found at: {pdf_path}")
            return jsonify({"error": "PDF file not found after compilation"}), 500
    except Exception as e:
        logger.error(f"Compilation error: {str(e)}")
        return jsonify({"error": f"Compilation error: {str(e)}"}), 500

def extract_latex_error(output):
    error_pattern = r'!(.*?)(?=\n[^\n])'
    errors = re.findall(error_pattern, output, re.DOTALL)
    if errors:
        return errors[0].strip()
    return "Unknown LaTeX error"

@app.route('/api/get_pdf/<path:filename>', methods=['GET'])
@login_required
def get_pdf(filename):
    user_dir = get_user_dir()
    full_path = os.path.join(user_dir, filename)
    if not os.path.normpath(full_path).startswith(os.path.normpath(user_dir)):
        return jsonify({"error": "Access denied"}), 403
    if os.path.exists(full_path):
        return send_file(full_path, mimetype='application/pdf')
    else:
        return jsonify({"error": "PDF file not found"}), 404

@app.route('/api/ai_assist', methods=['POST'])
@login_required
def ai_assist():
    user_input = request.json.get('input')
    file_references = request.json.get('file_references', [])
    if not user_input:
        return jsonify({"error": "No input provided"}), 400

    try:
        # Prepare the messages for the API
        messages = [
            {"role": "system", "content": "You are a LaTeX expert. Provide assistance for LaTeX-related questions and incorporate file content when requested."},
            {"role": "user", "content": user_input}
        ]

        # Process file references
        for file_ref in file_references:
            file_content = get_file_content(file_ref)
            if file_content:
                if file_ref.lower().endswith(('.png', '.jpg', '.jpeg', '.gif')):
                    # For images, we'll describe the image content
                    image_description = describe_image(file_content)
                    messages.append({"role": "user", "content": f"Image {file_ref} content: {image_description}"})
                else:
                    # For text files, we'll include the content directly
                    messages.append({"role": "user", "content": f"Content of {file_ref}:\n{file_content}"})

        logger.info(f"Sending request to OpenAI API with {len(messages)} messages")
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=messages,
            max_tokens=500,
            temperature=0.7,
        )
        ai_response = response.choices[0].message.content.strip()
        logger.info(f"AI assistance generated: {ai_response[:50]}...")
        return jsonify({"response": ai_response})
    except Exception as e:
        logger.error(f"AI assistance error: {str(e)}")
        return jsonify({"error": f"AI assistance error: {str(e)}"}), 500

def get_file_content(filename):
    user_upload_folder = os.path.join(app.config['UPLOAD_FOLDER'], current_user.id)
    file_path = os.path.join(user_upload_folder, filename)
    if os.path.exists(file_path):
        if filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif')):
            # For images, return base64 encoded content
            with open(file_path, "rb") as image_file:
                return base64.b64encode(image_file.read()).decode('utf-8')
        else:
            # For text files, return the content as is
            with open(file_path, 'r') as file:
                return file.read()
    return None

def describe_image(base64_image):
    # Decode base64 image
    image_data = base64.b64decode(base64_image)
    image = Image.open(io.BytesIO(image_data))

    # Here you would typically use an image description API
    # For this example, we'll just return basic image information
    return f"Image size: {image.size[0]}x{image.size[1]}, Format: {image.format}"

if __name__ == '__main__':
    app.run(debug=True)
