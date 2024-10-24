# GenTex: LaTeX Document Generator with AI Assistance

## Project Overview

GenTex is a web application that combines LaTeX document generation with AI assistance. It allows users to create LaTeX documents, compile them into PDFs, and get AI-powered help for LaTeX-related questions.

## Key Features

1. User authentication (login/register)
2. LaTeX code generation using AI
3. LaTeX to PDF compilation
4. PDF preview
5. AI assistance for LaTeX-related queries

## Technical Stack

- Backend: Flask (Python)
- Frontend: React
- AI: OpenAI GPT-3.5 Turbo
- PDF Generation: pdfLaTeX
- PDF Viewing: react-pdf

## Setup and Installation

1. Clone the repository
2. Set up the backend:
   - Install Python dependencies: `pip install -r requirements.txt`
   - Set up environment variables in `.env` file (OPENAI_API_KEY, SECRET_KEY)
3. Set up the frontend:
   - Navigate to the frontend directory
   - Install npm packages: `npm install`
4. Ensure pdfLaTeX is installed on your system

## Running the Application

1. Start the Flask backend: `python app.py`
2. Start the React frontend: `npm start` in the frontend directory

## Recent Changes and Troubleshooting

We recently addressed several issues:

1. LaTeX Compilation:
   - Added more robust error handling and logging for LaTeX compilation
   - Implemented a function to clean up AI-generated LaTeX code

2. PDF Viewing:
   - Updated the PDF.js worker configuration
   - Added more detailed logging for PDF loading and rendering

3. Frontend Dependencies:
   - Updated `pdfjs-dist` and `react-pdf` to specific versions for compatibility
   - Configured `react-app-rewired` for custom webpack configuration

4. Backend Improvements:
   - Enhanced error handling and logging
   - Improved user authentication and session management

## Known Issues

- Ensure that pdfLaTeX is properly installed and accessible in the system PATH
- If PDF preview doesn't work, check browser console for detailed error messages

## Future Improvements

- Implement real-time collaboration features
- Add support for custom LaTeX templates
- Enhance AI assistance with more specific LaTeX knowledge

## Contributing

Contributions to GenTex are welcome! Please fork the repository and submit pull requests with your improvements.

## License

[Add your chosen license here]
