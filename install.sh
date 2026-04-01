#!/bin/bash

echo "Installing Sky Smart Website Dependencies..."
echo

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed!"
    echo "Please install Node.js from https://nodejs.org/"
    echo "Then run this script again."
    exit 1
fi

echo "Node.js is installed. Installing dependencies..."
echo

# Install dependencies
npm install

if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install dependencies!"
    exit 1
fi

echo
echo "✅ Installation completed successfully!"
echo
echo "To start the website:"
echo "  npm start"
echo
echo "To start in development mode:"
echo "  npm run dev"
echo
echo "The website will be available at: http://localhost:3000"
echo

