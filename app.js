require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const { createClient } = require('@supabase/supabase-js');

// Initialize Express app
const app = express();
const port = process.env.PORT || 8080;

// Configure Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Configure multer
const upload = multer({
  dest: 'temp/',
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).sendFile(path.join(__dirname, 'public', 'error.html'));
  }

  try {
    const fileData = fs.readFileSync(req.file.path);
    const fileExt = path.extname(req.file.originalname);
    const fileName = `${Date.now()}${fileExt}`;
    const filePath = `uploads/${fileName}`;

    // Upload to Supabase
    const { error } = await supabase.storage
      .from(process.env.SUPABASE_BUCKET_NAME)
      .upload(filePath, fileData, {
        contentType: req.file.mimetype,
        upsert: false
      });

    if (error) throw error;

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(process.env.SUPABASE_BUCKET_NAME)
      .getPublicUrl(filePath);

    // Generate QR code
    const qrCodeDataURL = await QRCode.toDataURL(publicUrl);

    // Clean up
    fs.unlinkSync(req.file.path);

    // Send success page with data
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
        ${successPageTemplate(publicUrl, qrCodeDataURL, req.file.originalname)}
      </html>
    `);
  } catch (err) {
    console.error('Upload error:', err);
    if (req.file?.path) fs.unlinkSync(req.file.path);
    res.status(500).sendFile(path.join(__dirname, 'public', 'error.html'));
  }
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});

// Template functions
function successPageTemplate(url, qrCode, filename) {
  return `
    <head>
      <title>QuickAV - Upload Successful</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <script src="https://cdn.tailwindcss.com"></script>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
      <style>
        body { font-family: 'Inter', sans-serif; }
        .gradient-text { background-clip: text; -webkit-background-clip: text; color: transparent; }
      </style>
    </head>
    <body class="bg-gray-50 min-h-screen flex flex-col">
      ${header()}
      <main class="flex-grow container mx-auto px-4 py-8 sm:py-12">
        <div class="max-w-3xl mx-auto bg-white rounded-xl shadow-md overflow-hidden p-6 sm:p-8">
          <div class="text-center mb-6 sm:mb-8">
            <div class="w-14 h-14 sm:w-16 sm:h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
              <svg class="w-6 h-6 sm:w-8 sm:h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            <h1 class="text-xl sm:text-2xl font-bold text-gray-800 mb-2">Upload Successful!</h1>
            <p class="text-gray-600 text-sm sm:text-base">Your file is now available at:</p>
          </div>
          
          <div class="mb-6 sm:mb-8">
            <div class="flex items-center justify-between bg-gray-100 rounded-lg p-3 sm:p-4 mb-3 sm:mb-4">
              <p class="truncate text-xs sm:text-sm font-medium text-gray-700">${filename}</p>
            </div>
            
            <div class="bg-gray-100 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
              <p class="text-xs sm:text-sm font-medium text-gray-500 mb-1">Shareable Link</p>
              <div class="flex flex-col sm:flex-row gap-2 sm:gap-0">
                <input id="fileUrl" type="text" value="${url}" readonly 
                  class="flex-grow bg-white border border-gray-300 rounded-lg sm:rounded-l-lg sm:rounded-r-none px-3 sm:px-4 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <button onclick="copyToClipboard()" 
                  class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg sm:rounded-r-lg sm:rounded-l-none text-xs sm:text-sm font-medium transition-colors">
                  Copy
                </button>
              </div>
            </div>
            
            <div class="text-center">
              <p class="text-xs sm:text-sm font-medium text-gray-500 mb-3 sm:mb-4">Scan QR Code to access file</p>
              <div class="flex justify-center">
                <img src="${qrCode}" alt="QR Code" class="w-40 h-40 sm:w-48 sm:h-48 border-4 border-white shadow-lg rounded-lg">
              </div>
            </div>
          </div>
          
          <div class="flex justify-center">
            <a href="/" class="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 sm:px-6 sm:py-3 rounded-lg text-sm sm:text-base font-medium transition-colors">
              Upload Another File
            </a>
          </div>
        </div>
      </main>
      ${footer()}
      <script>
        function copyToClipboard() {
          const input = document.getElementById('fileUrl');
          input.select();
          document.execCommand('copy');
          alert('Link copied to clipboard!');
        }
      </script>
    </body>
  `;
}

function header() {
  return `
    <header class="bg-white shadow-sm">
      <div class="container mx-auto px-4 py-3 sm:py-4 flex justify-center items-center">
        <a href="/" class="flex items-center">
          <span class="text-lg sm:text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 gradient-text">QuickAV</span>
        </a>
      </div>
    </header>
  `;
}

function footer() {
  return `
    <footer class="bg-gray-800 text-white py-6 sm:py-8">
      <div class="container mx-auto px-4">
        <div class="flex flex-col md:flex-row justify-between items-center">
          <div class="mb-4 md:mb-0">
            <span class="text-lg sm:text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 gradient-text">QuickAV</span>
            <p class="text-gray-400 mt-1 sm:mt-2 text-xs sm:text-sm">Fast and secure file sharing</p>
          </div>
        </div>
        <div class="border-t border-gray-700 mt-4 sm:mt-6 pt-4 sm:pt-6 text-center text-gray-400 text-xs sm:text-sm">
          <p>© ${new Date().getFullYear()} QuickAV. All rights reserved.</p>
        </div>
      </div>
    </footer>
  `;
}