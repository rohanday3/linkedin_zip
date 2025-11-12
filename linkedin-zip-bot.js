/**
 * LinkedIn Zip/Trail Game Bot
 * Automatically fetches and solves the daily puzzle
 */

class LinkedInZipBot {
  constructor() {
    this.apiUrl = '/voyager/api/graphql?includeWebMetadata=true&variables=(gameTypeId:6)&queryId=voyagerIdentityDashGames.b13494b14a45c551e881ca8aa820dff0'; // Will be detected dynamically
    this.puzzle = null;
    this.gridSize = 0;
    this.solution = [];
    this.capturedRequests = [];
  }

  /**
   * Detect the correct API URL by intercepting network requests
   */
  async detectApiUrl() {
    console.log('🔍 Detecting API URL from network requests...');

    // First, check if we already captured it
    const existingUrl = this.findGameApiUrl();
    if (existingUrl) {
      this.apiUrl = existingUrl;
      console.log('✅ Found API URL from previous requests:', existingUrl);
      return existingUrl;
    }

    // If not found, we need to trigger a refresh and intercept
    console.log('📡 Setting up network interceptor...');

    return new Promise((resolve, reject) => {
      // Intercept fetch requests
      const originalFetch = window.fetch;
      const capturedUrls = [];

      window.fetch = async function(...args) {
        const url = args[0];

        // Check if this is a game API call - simplified filters
        if (typeof url === 'string' &&
            url.includes('/voyager/api/graphql') &&
            url.includes('gameTypeId:6')) {
          console.log('🎯 Captured game API URL:', url);
          capturedUrls.push(url);
        }

        return originalFetch.apply(this, args);
      };

      // Trigger a page refresh or click to make the API call
      console.log('💡 Refreshing puzzle to capture API call...');
      const refreshButton = document.querySelector('[data-test-id="refresh-button"]');
      if (refreshButton) {
        refreshButton.click();
      } else {
        // Try to find and click any button that might trigger the API
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          if (btn.textContent.includes('Refresh') || btn.textContent.includes('Play')) {
            btn.click();
            break;
          }
        }
      }

      // Wait for the API call to happen
      setTimeout(() => {
        // Restore original fetch
        window.fetch = originalFetch;

        if (capturedUrls.length > 0) {
          const gameUrl = capturedUrls[0];
          console.log('✅ API URL detected:', gameUrl);
          resolve(gameUrl);
        } else {
          console.warn('⚠️ No API URL captured. Using fallback URL.');
          // Fallback to the original URL with includeWebMetadata
          resolve('/voyager/api/graphql?includeWebMetadata=true&variables=(gameTypeId:6)&queryId=voyagerIdentityDashGames.b13494b14a45c551e881ca8aa820dff0');
        }
      }, 3000);
    });
  }

  /**
   * Wait for the game board to load
   */
  async waitForGameBoard(timeout = 10000) {
    console.log('⏳ Waiting for game board to load...');

    // First, check if it's already there
    let gameBoard = document.querySelector('.trail-board');
    let cells = document.querySelectorAll('[data-cell-idx]');

    if (gameBoard && cells.length > 0) {
      console.log(`✅ Game board already present with ${cells.length} cells (no wait needed)`);
      return true;
    }

    // If not, wait for it to appear
    console.log('⏳ Board not ready yet, waiting...');
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      gameBoard = document.querySelector('.trail-board');
      cells = document.querySelectorAll('[data-cell-idx]');

      if (gameBoard && cells.length > 0) {
        console.log(`✅ Game board loaded with ${cells.length} cells (after ${Date.now() - startTime}ms)`);
        return true;
      }

      // Wait a bit before checking again
      await this.sleep(200);
    }

    console.warn(`⚠️ Game board did not load within timeout (${timeout}ms)`);
    return false;
  }  /**
   * Find game API URL from Performance API (already loaded requests)
   */
  findGameApiUrl() {
    try {
      const perfEntries = performance.getEntriesByType('resource');

      // Log all graphql requests for debugging
      console.log('🔍 Searching through network requests...');
      const graphqlEntries = perfEntries.filter(entry =>
        entry.name.includes('/voyager/api/graphql')
      );
      console.log(`Found ${graphqlEntries.length} GraphQL requests`);

      // Use simpler filters - just look for the game API pattern
      const gameApiEntry = perfEntries.find(entry =>
        entry.name.includes('/voyager/api/graphql') &&
        entry.name.includes('gameTypeId:6')
      );

      if (gameApiEntry) {
        // Extract just the path and query string
        const url = new URL(gameApiEntry.name);
        const fullPath = url.pathname + url.search;
        console.log('📍 Found API URL:', fullPath);
        return fullPath;
      }

      console.log('⚠️ No matching game API URL found in performance entries');
    } catch (e) {
      console.warn('⚠️ Could not access Performance API:', e);
    }
    return null;
  }

  /**
   * Debug helper - shows all cookies and potential CSRF tokens
   */
  debugCSRF() {
    console.log('🔍 Debugging CSRF Token...\n');

    console.log('📋 All Cookies:');
    document.cookie.split('; ').forEach(cookie => {
      console.log('  ', cookie);
    });

    console.log('\n🔍 Meta Tags:');
    document.querySelectorAll('meta').forEach(meta => {
      if (meta.name && meta.content) {
        console.log(`   ${meta.name}: ${meta.content.substring(0, 50)}`);
      }
    });

    console.log('\n💡 Recommended: Copy the JSESSIONID value from cookies');
    console.log('   Then use: bot.setCSRFToken("your-token-here")');
  }

  /**
   * Manually set CSRF token if auto-detection fails
   */
  setCSRFToken(token) {
    this.manualCSRFToken = token;
    console.log('✅ CSRF token set manually');
  }

  /**
   * Fetch today's puzzle from LinkedIn API
   */
  async fetchPuzzle() {
    try {
      // Get CSRF token
      const csrfToken = this.getCSRFToken();
      console.log('🔑 CSRF Token:', csrfToken ? csrfToken.substring(0, 20) + '...' : 'NOT FOUND');

      const response = await fetch(this.apiUrl, {
        method: 'GET',
        credentials: 'include', // Include cookies
        headers: {
          'accept': 'application/vnd.linkedin.normalized+json+2.1',
          'csrf-token': csrfToken,
          'x-restli-protocol-version': '2.0.0',
          'x-li-lang': 'en_US'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ HTTP Error:', response.status, errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      // Extract puzzle data from response
      const gameData = data.included[0];
      this.puzzle = gameData.gamePuzzle.trailGamePuzzle;
      this.gridSize = this.puzzle.gridSize;
      this.solution = this.puzzle.solution;

      console.log('✅ Puzzle fetched successfully!');
      console.log('Grid Size:', this.gridSize);
      console.log('Solution Length:', this.solution.length);
      console.log('Ordered Sequence:', this.puzzle.orderedSequence);

      return this.puzzle;
    } catch (error) {
      console.error('❌ Failed to fetch puzzle:', error);
      throw error;
    }
  }

  /**
   * Get CSRF token from cookies or meta tag
   */
  getCSRFToken() {
    // Method 1: Try to get from JSESSIONID cookie
    const jsessionMatch = document.cookie.match(/JSESSIONID="([^"]+)"/);
    if (jsessionMatch) {
      return jsessionMatch[1].replace(/^"(.+)"$/, '$1');
    }

    // Method 2: Try to get from csrf-token meta tag
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta && meta.content) {
      return meta.content;
    }

    // Method 3: Extract from any cookie that looks like CSRF
    const csrfCookie = document.cookie.split('; ').find(row => row.startsWith('JSESSIONID='));
    if (csrfCookie) {
      return csrfCookie.split('=')[1].replace(/"/g, '');
    }

    // Method 4: Look for it in the page's window object
    if (window.sessionStorage) {
      const stored = window.sessionStorage.getItem('JSESSIONID');
      if (stored) return stored;
    }

    console.warn('⚠️ CSRF token not found, request may fail');
    return '';
  }

  /**
   * Convert cell index to grid coordinates (row, col)
   */
  indexToCoords(index) {
    return {
      row: Math.floor(index / this.gridSize),
      col: index % this.gridSize
    };
  }

  /**
   * Get the DOM element for a cell
   */
  getCellElement(cellIndex) {
    return document.querySelector(`[data-cell-idx="${cellIndex}"]`);
  }

  /**
   * Get the center coordinates of a cell element
   */
  getCellCenter(cellElement) {
    const rect = cellElement.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }

  /**
   * Simulate a mouse event
   */
  simulateMouseEvent(element, eventType, x, y) {
    const event = new MouseEvent(eventType, {
      view: window,
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y
    });
    element.dispatchEvent(event);
  }

  /**
   * Simulate a touch event
   */
  simulateTouchEvent(element, eventType, x, y) {
    const touch = new Touch({
      identifier: Date.now(),
      target: element,
      clientX: x,
      clientY: y,
      radiusX: 2.5,
      radiusY: 2.5,
      rotationAngle: 10,
      force: 0.5,
    });

    const event = new TouchEvent(eventType, {
      cancelable: true,
      bubbles: true,
      touches: [touch],
      targetTouches: [touch],
      changedTouches: [touch],
    });

    element.dispatchEvent(event);
  }

  /**
   * Sleep/delay function
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculate direction from one cell to another
   */
  getDirection(fromCell, toCell) {
    const fromCoords = this.indexToCoords(fromCell);
    const toCoords = this.indexToCoords(toCell);

    const rowDiff = toCoords.row - fromCoords.row;
    const colDiff = toCoords.col - fromCoords.col;

    if (rowDiff === -1 && colDiff === 0) return 'ArrowUp';
    if (rowDiff === 1 && colDiff === 0) return 'ArrowDown';
    if (rowDiff === 0 && colDiff === -1) return 'ArrowLeft';
    if (rowDiff === 0 && colDiff === 1) return 'ArrowRight';

    return null; // Not adjacent cells
  }

  /**
   * Simulate a keyboard event
   */
  simulateKeyPress(key) {
    const board = document.querySelector('[data-trail-grid]');
    if (!board) return false;

    const keydownEvent = new KeyboardEvent('keydown', {
      key: key,
      code: key,
      keyCode: key === 'ArrowUp' ? 38 : key === 'ArrowDown' ? 40 : key === 'ArrowLeft' ? 37 : 39,
      bubbles: true,
      cancelable: true
    });

    const keyupEvent = new KeyboardEvent('keyup', {
      key: key,
      code: key,
      keyCode: key === 'ArrowUp' ? 38 : key === 'ArrowDown' ? 40 : key === 'ArrowLeft' ? 37 : 39,
      bubbles: true,
      cancelable: true
    });

    board.dispatchEvent(keydownEvent);
    board.dispatchEvent(keyupEvent);
    return true;
  }

  /**
   * Solve the puzzle using arrow keys (MUCH EASIER!)
   */
  async solvePuzzle(speed = 100) {
    if (!this.solution || this.solution.length === 0) {
      console.error('No solution loaded. Call fetchPuzzle() first.');
      return;
    }

    console.log('Starting to solve puzzle with arrow keys...');
    // board element is of class trail-board

    // wait for game board to be ready
    await this.waitForGameBoard(10000);
    const board = document.querySelector('.trail-board');

    if (!board) {
      console.error('Game board not found!');
      return;
    }

    // Focus the board first
    board.focus();
    await this.sleep(200);

    // Click the starting cell to begin
    const startCell = this.solution[0];
    const startElement = this.getCellElement(startCell);

    if (!startElement) {
      console.error('Start cell not found!');
      return;
    }

    console.log(`Starting at cell ${startCell}`);
    startElement.click();
    await this.sleep(300);

    // Now use arrow keys to navigate through the solution
    for (let i = 1; i < this.solution.length; i++) {
      const fromCell = this.solution[i - 1];
      const toCell = this.solution[i];
      const direction = this.getDirection(fromCell, toCell);

      if (!direction) {
        console.error(`Invalid move from ${fromCell} to ${toCell} - not adjacent!`);
        break;
      }

      // Press the arrow key
      this.simulateKeyPress(direction);

      // Visual feedback
      if (i % 6 === 0) {
        console.log(`⌨️  Progress: ${i}/${this.solution.length} cells (${Math.round(i/this.solution.length*100)}%)`);
      }

      await this.sleep(speed);
    }

    console.log('Arrow key sequence completed!');
    console.log(`Path: ${this.solution[0]} → ... → ${this.solution[this.solution.length - 1]} (${this.solution.length} cells)`);

    // Wait to see the result
    await this.sleep(1500);

    // Check if puzzle was solved
    const hasWon = document.querySelector('.trail-grid--game-won');
    if (hasWon) {
      console.log('🎉 VICTORY! Puzzle solved successfully!');
    }
  }
  visualizeSolution() {
    if (!this.solution || this.gridSize === 0) {
      console.error('\nNo solution to visualize');
      return;
    }

    console.log('\nSolution Visualization:');
    console.log('═'.repeat(this.gridSize * 4));

    // Create grid
    const grid = Array(this.gridSize).fill().map(() => Array(this.gridSize).fill('  ·'));

    // Mark solution path with numbers
    this.solution.forEach((cellIdx, step) => {
      const coords = this.indexToCoords(cellIdx);
      const displayNum = step.toString().padStart(3);
      grid[coords.row][coords.col] = displayNum;
    });

    // Print grid
    grid.forEach((row, rowIdx) => {
      console.log(row.join(' '));
    });

    console.log('═'.repeat(this.gridSize * 4));

    // Show numbered sequence
    console.log('\n🔢 Ordered Sequence (numbered cells):');
    this.puzzle.orderedSequence.forEach((cellIdx, idx) => {
      console.log(`  ${idx + 1}. Cell ${cellIdx} (Row ${Math.floor(cellIdx / this.gridSize)}, Col ${cellIdx % this.gridSize})`);
    });
  }

  /**
   * Main bot execution
   */
  async run() {
    console.log('🤖 LinkedIn Zip Bot Starting...\n');

    // Step 1: Check for and click the launch button
      console.log('\nStep 1: Checking for launch button...');
      const launchButton = document.querySelector('#launch-footer-start-button');

      if (launchButton) {
        console.log('✅ Found launch button, clicking...');
        launchButton.click();
        console.log('⏳ Waiting for game to load...');
        await this.sleep(1); // Wait for game to load after clicking
      } else {
        console.log('ℹ️ Launch button not found, game may already be started');
      }

    try {
      // Step 1: Detect API URL
      console.log('\nStep 1: Detecting API URL...');
      this.apiUrl = await this.detectApiUrl();
      console.log('✅ Using API URL:', this.apiUrl);

      // Step 2: Fetch puzzle data
      console.log('\nStep 2: Fetching puzzle data...');
      await this.fetchPuzzle();

      // Visualize solution
      this.visualizeSolution();

      // Step 3: Solve puzzle
      console.log('\nStep 3: Solving puzzle...');
      await this.solvePuzzle(0); // 10ms delay between cells

      console.log('\n✅ Bot completed successfully!');
    } catch (error) {
      console.error('\n❌ Bot failed:', error);
    }
  } // end of run()

} // end of class LinkedInZipBot

// Store bot instance globally for cleanup
window.bot = new LinkedInZipBot();
window.bot.run();