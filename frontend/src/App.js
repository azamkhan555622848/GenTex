import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Controlled as CodeMirror } from 'react-codemirror2';
import axios from 'axios';
import { Document, Page, pdfjs } from 'react-pdf';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBold, faLink, faSquareRootAlt, faUpload, faFolder, faDownload, faArrowUp, faArrowDown, faPlus, faMinus, faTrash } from '@fortawesome/free-solid-svg-icons';

import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/material.css';
import 'codemirror/mode/stex/stex';
import 'codemirror/addon/edit/matchbrackets';
import 'codemirror/addon/edit/closebrackets';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

// At the top of the file, configure axios
axios.defaults.withCredentials = true;

function App() {
  const [latexCode, setLatexCode] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [aiInput, setAiInput] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [scale, setScale] = useState(1.0);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');

  const chatEndRef = useRef(null);

  const [files, setFiles] = useState([]);
  const fileInputRef = useRef(null);

  const [showFileList, setShowFileList] = useState(false);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteOptions, setAutocompleteOptions] = useState([]);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [fileListWidth, setFileListWidth] = useState(250);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  const [editorWidth, setEditorWidth] = useState(50); // 50% of the main content width
  const [isDraggingEditor, setIsDraggingEditor] = useState(false);
  const [zoomPercentage, setZoomPercentage] = useState(100);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  const sendPrompt = async (prompt) => {
    console.log(`Sending prompt: ${prompt}`);
    setIsLoading(true);
    setError('');
    try {
      const response = await axios.post('/api/process_input', { input: prompt });
      const generatedLatexCode = response.data.latex_code;
      console.log('Generated LaTeX code:', generatedLatexCode);
      
      // First update the state
      setLatexCode(generatedLatexCode);
      
      // Then update chat history
      setChatHistory(prevHistory => [...prevHistory, 
        { role: 'user', content: prompt }, 
        { role: 'assistant', content: generatedLatexCode }
      ]);
      
      setAiInput('');
    } catch (error) {
      console.error('Error processing input:', error);
      setError('Failed to process input. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const compileLatex = async () => {
    console.log('Compiling LaTeX');
    setIsLoading(true);
    setError('');
    try {
      const compileResponse = await axios.post('/api/compile_latex', { latex: latexCode });
      if (compileResponse.data.message === "PDF compiled successfully") {
        const pdfPath = compileResponse.data.pdf_path;
        const newPdfUrl = `/api/get_pdf/${pdfPath}?timestamp=${new Date().getTime()}`;
        setPdfUrl(newPdfUrl);
        setPageNumber(1); // Reset to first page
      } else {
        setError('LaTeX compilation failed. Please check your code.');
      }
    } catch (error) {
      console.error('Error compiling LaTeX:', error);
      setError('Failed to compile LaTeX. Please check your code and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAiAssist = async () => {
    console.log(`Getting AI assistance for: ${aiInput}`);
    setIsLoading(true);
    setError('');
    try {
      const fileRegex = /@(\S+)/g;
      const fileMatches = [...aiInput.matchAll(fileRegex)];
      const fileReferences = fileMatches.map(match => match[1]);

      const response = await axios.post('/api/ai_assist', { 
        input: aiInput,
        file_references: fileReferences
      });
      const aiMessage = response.data.response;
      setChatHistory([...chatHistory, { role: 'user', content: aiInput }, { role: 'assistant', content: aiMessage }]);
      setAiInput('');
    } catch (error) {
      console.error('Error getting AI assistance:', error);
      setError('Failed to get AI assistance. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    setPageNumber(1); // Reset to first page when a new document is loaded
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/login', { username: loginUsername, password: loginPassword });
      setIsLoggedIn(true);
      setError('');
    } catch (error) {
      setError('Login failed. Please check your credentials.');
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/register', { username: registerUsername, password: registerPassword });
      setError('');
      setIsLoggedIn(true);
    } catch (error) {
      setError('Registration failed. Username might already exist.');
    }
  };

  const handleBold = () => {
    // Implementation without using 'editor'
    setLatexCode(prevCode => `\\textbf{${prevCode}}`);
  };

  const handleEquation = () => {
    // Implementation without using 'editor'
    setLatexCode(prevCode => `${prevCode}\n\\begin{equation}\n\n\\end{equation}`);
  };

  const handleLink = () => {
    // Implementation without using 'editor'
    setLatexCode(prevCode => `\\href{url}{${prevCode}}`);
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post('/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      console.log('File uploaded successfully:', response.data);
      // You might want to update the UI to show the uploaded file or update the LaTeX code
    } catch (error) {
      console.error('Error uploading file:', error);
      setError('Failed to upload file. Please try again.');
    }
  };

  const fetchFiles = async () => {
    try {
      const response = await axios.get('/api/files');
      setFiles(response.data.files);
    } catch (error) {
      console.error('Error fetching files:', error);
      setError('Failed to fetch files. Please try again.');
    }
  };

  const handleDeleteFile = async (filename) => {
    try {
      await axios.delete(`/api/delete_file/${filename}`);
      console.log(`File ${filename} deleted successfully`);
      fetchFiles(); // Refresh the file list after deletion
    } catch (error) {
      console.error('Error deleting file:', error);
      setError('Failed to delete file. Please try again.');
    }
  };

  const toggleFileList = () => {
    setShowFileList(!showFileList);
    if (!showFileList) {
      fetchFiles();
    }
  };

  const handleAiInputChange = (e) => {
    const inputValue = e.target.value;
    setAiInput(inputValue);
    
    // Check if we should show autocomplete
    const lastAtSymbol = inputValue.lastIndexOf('@');
    if (lastAtSymbol !== -1 && lastAtSymbol < inputValue.length) {
      const query = inputValue.slice(lastAtSymbol + 1);
      const filteredOptions = files.filter(file => file.toLowerCase().includes(query.toLowerCase()));
      setAutocompleteOptions(filteredOptions);
      setShowAutocomplete(true);
      setCursorPosition(e.target.selectionStart);
    } else {
      setShowAutocomplete(false);
    }
  };

  const handleAutocompleteSelect = (fileName) => {
    const inputValue = aiInput;
    const lastAtSymbol = inputValue.lastIndexOf('@');
    const newValue = inputValue.slice(0, lastAtSymbol + 1) + fileName + inputValue.slice(cursorPosition);
    setAiInput(newValue);
    setShowAutocomplete(false);
  };

  const handleDragStart = (e) => {
    setIsDragging(true);
    dragStartX.current = e.clientX;
    dragStartWidth.current = fileListWidth;
  };

  const handleDrag = useCallback((e) => {
    if (!isDragging) return;
    const deltaX = dragStartX.current - e.clientX;
    const newWidth = Math.max(200, Math.min(500, dragStartWidth.current + deltaX));
    setFileListWidth(newWidth);
  }, [isDragging]);

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDrag);
      window.addEventListener('mouseup', handleDragEnd);
    } else {
      window.removeEventListener('mousemove', handleDrag);
      window.removeEventListener('mouseup', handleDragEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleDrag);
      window.removeEventListener('mouseup', handleDragEnd);
    };
  }, [isDragging, handleDrag]);

  const handleEditorDragStart = (e) => {
    setIsDraggingEditor(true);
    dragStartX.current = e.clientX;
    dragStartWidth.current = editorWidth;
  };

  const handleEditorDrag = useCallback((e) => {
    if (!isDraggingEditor) return;
    const deltaX = e.clientX - dragStartX.current;
    const containerWidth = document.querySelector('.main-content').offsetWidth;
    const newWidth = (dragStartWidth.current + (deltaX / containerWidth) * 100);
    setEditorWidth(Math.max(20, Math.min(80, newWidth))); // Limit between 20% and 80%
  }, [isDraggingEditor]);

  const handleEditorDragEnd = () => {
    setIsDraggingEditor(false);
  };

  useEffect(() => {
    if (isDraggingEditor) {
      window.addEventListener('mousemove', handleEditorDrag);
      window.addEventListener('mouseup', handleEditorDragEnd);
    } else {
      window.removeEventListener('mousemove', handleEditorDrag);
      window.removeEventListener('mouseup', handleEditorDragEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleEditorDrag);
      window.removeEventListener('mouseup', handleEditorDragEnd);
    };
  }, [isDraggingEditor, handleEditorDrag]);

  const handleZoomIn = () => {
    setScale(prevScale => {
      const newScale = prevScale + 0.1;
      setZoomPercentage(Math.round(newScale * 100));
      return newScale;
    });
  };

  const handleZoomOut = () => {
    setScale(prevScale => {
      const newScale = Math.max(0.1, prevScale - 0.1);
      setZoomPercentage(Math.round(newScale * 100));
      return newScale;
    });
  };

  const handleDownload = () => {
    if (pdfUrl) {
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = 'document.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  // Add this debug effect
  useEffect(() => {
    console.log('Current LaTeX code:', latexCode);
  }, [latexCode]);

  if (!isLoggedIn) {
    return (
      <div className="auth-container">
        <form onSubmit={handleLogin}>
          <input
            type="text"
            value={loginUsername}
            onChange={(e) => setLoginUsername(e.target.value)}
            placeholder="Username"
            required
          />
          <input
            type="password"
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
            placeholder="Password"
            required
          />
          <button type="submit">Login</button>
        </form>
        <form onSubmit={handleRegister}>
          <input
            type="text"
            value={registerUsername}
            onChange={(e) => setRegisterUsername(e.target.value)}
            placeholder="Username"
            required
          />
          <input
            type="password"
            value={registerPassword}
            onChange={(e) => setRegisterPassword(e.target.value)}
            placeholder="Password"
            required
          />
          <button type="submit">Register</button>
        </form>
        {error && <div className="error-message">{error}</div>}
      </div>
    );
  }

  return (
    <div className="App">
      <div className="chat-pane">
        <div className="chat-history">
          {chatHistory.map((message, index) => (
            <div key={index} className={`chat-message ${message.role}`}>
              <strong>{message.role === 'user' ? 'You' : 'AI'}:</strong> {message.content}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <div className="input-container">
          <textarea
            value={aiInput}
            onChange={handleAiInputChange}
            placeholder="Ask AI for assistance or generate LaTeX"
          />
          {showAutocomplete && (
            <div className="autocomplete">
              {autocompleteOptions.map((option, index) => (
                <div 
                  key={index} 
                  className="autocomplete-option"
                  onClick={() => handleAutocompleteSelect(option)}
                >
                  {option}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="ai-buttons">
          <button onClick={() => sendPrompt(aiInput)} disabled={isLoading}>
            {isLoading ? 'Processing...' : 'Generate LaTeX'}
          </button>
          <button onClick={handleAiAssist} disabled={isLoading}>
            {isLoading ? 'Getting assistance...' : 'Get AI Assistance'}
          </button>
        </div>
      </div>
      <div className="main-content">
        <div className="editor-pane" style={{ width: `${editorWidth}%` }}>
          <div className="editor-toolbar">
            <button onClick={handleBold} className="toolbar-button" title="Bold">
              <FontAwesomeIcon icon={faBold} />
            </button>
            <button onClick={handleEquation} className="toolbar-button" title="Insert Equation">
              <FontAwesomeIcon icon={faSquareRootAlt} />
            </button>
            <button onClick={handleLink} className="toolbar-button" title="Insert Link">
              <FontAwesomeIcon icon={faLink} />
            </button>
            <button onClick={compileLatex} disabled={isLoading} className="compile-button">
              {isLoading ? 'Compiling...' : 'Compile Now'}
            </button>
            <button onClick={() => fileInputRef.current.click()} className="toolbar-button" title="Upload File">
              <FontAwesomeIcon icon={faUpload} />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
            <button onClick={toggleFileList} className="toolbar-button" title="View Files">
              <FontAwesomeIcon icon={faFolder} />
            </button>
          </div>
          <div className="editor-container">
            <CodeMirror
              value={latexCode || ''} // Add default empty string
              options={{
                mode: 'stex',
                theme: 'material',
                lineNumbers: true,
                lineWrapping: true,
                matchBrackets: true,
                autoCloseBrackets: true,
                viewportMargin: Infinity,
              }}
              onBeforeChange={(editor, data, value) => {
                setLatexCode(value);
              }}
              editorDidMount={editor => {
                setTimeout(() => {
                  editor.refresh();
                }, 100);
              }}
            />
          </div>
        </div>
        <div className="editor-resize-handle" onMouseDown={handleEditorDragStart}></div>
        <div className="preview-pane" style={{ width: `${100 - editorWidth}%` }}>
          <div className="pdf-toolbar">
            <div className="pdf-toolbar-left">
              <button onClick={handleDownload} className="toolbar-button" title="Download PDF">
                <FontAwesomeIcon icon={faDownload} />
              </button>
            </div>
            <div className="pdf-toolbar-center">
              <button 
                onClick={() => setPageNumber(prev => Math.max(1, prev - 1))} 
                disabled={pageNumber <= 1}
                className="toolbar-button"
              >
                <FontAwesomeIcon icon={faArrowUp} />
              </button>
              <span>{pageNumber} / {numPages || 1}</span>
              <button 
                onClick={() => setPageNumber(prev => Math.min(numPages || prev, prev + 1))} 
                disabled={pageNumber >= (numPages || pageNumber)}
                className="toolbar-button"
              >
                <FontAwesomeIcon icon={faArrowDown} />
              </button>
            </div>
            <div className="pdf-toolbar-right">
              <button onClick={handleZoomOut} className="toolbar-button" title="Zoom Out">
                <FontAwesomeIcon icon={faMinus} />
              </button>
              <span>{zoomPercentage}%</span>
              <button onClick={handleZoomIn} className="toolbar-button" title="Zoom In">
                <FontAwesomeIcon icon={faPlus} />
              </button>
            </div>
          </div>
          <div className="pdf-container">
            {pdfUrl ? (
              <Document
                file={pdfUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={(error) => {
                  console.error('Error loading PDF:', error);
                  setError(`Failed to load PDF: ${error.message}`);
                }}
              >
                <Page 
                  key={`page_${pageNumber}`} 
                  pageNumber={pageNumber} 
                  scale={scale} 
                />
              </Document>
            ) : (
              <div className="pdf-placeholder">
                <p>No PDF to display</p>
                <p>Click "Compile Now" to generate PDF</p>
              </div>
            )}
          </div>
        </div>
        {showFileList && (
          <div className="file-list-pane" style={{ width: `${fileListWidth}px` }}>
            <div 
              className="file-list-drag-handle"
              onMouseDown={handleDragStart}
            ></div>
            <h3>Uploaded Files</h3>
            <ul>
              {files.map((file, index) => (
                <li key={index}>
                  {file}
                  <button onClick={() => handleDeleteFile(file)} className="delete-file-button">
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {error && <div className="error-message">{error}</div>}
      {/* Removed the logout button */}
    </div>
  );
}

export default App;
