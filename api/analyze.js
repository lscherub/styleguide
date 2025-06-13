const axios = require('axios');
const cheerio = require('cheerio');

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        console.log(`Analyzing website: ${url}`);
        
        // Fetch the website
        const response = await axios.get(url, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const html = response.data;
        const $ = cheerio.load(html);

        // Extract colors and fonts
        const colors = await extractColors($, url);
        const fonts = await extractFonts($, url);

        res.json({
            success: true,
            url: url,
            colors: colors,
            fonts: fonts,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error analyzing website:', error.message);
        res.status(500).json({ 
            error: 'Failed to analyze website',
            details: error.message
        });
    }
}

// Extract colors from CSS
async function extractColors($, baseUrl) {
    const colors = new Set();

    // Get inline styles
    $('*').each((i, element) => {
        const style = $(element).attr('style');
        if (style) {
            extractColorsFromCSS(style, colors);
        }
    });

    // Get CSS from style tags
    $('style').each((i, element) => {
        const cssContent = $(element).html();
        if (cssContent) {
            extractColorsFromCSS(cssContent, colors);
        }
    });

    // Get CSS from external stylesheets (limit to first 3)
    const stylesheets = [];
    $('link[rel="stylesheet"]').each((i, element) => {
        const href = $(element).attr('href');
        if (href) {
            try {
                const fullUrl = new URL(href, baseUrl).href;
                stylesheets.push(fullUrl);
            } catch (e) {
                // Invalid URL, skip
            }
        }
    });

    // Fetch external CSS files
    for (let i = 0; i < Math.min(stylesheets.length, 3); i++) {
        try {
            const cssResponse = await axios.get(stylesheets[i], {
                timeout: 8000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            extractColorsFromCSS(cssResponse.data, colors);
        } catch (error) {
            console.log(`Could not fetch CSS from ${stylesheets[i]}`);
        }
    }

    // Convert colors to array and categorize
    const colorArray = Array.from(colors)
        .filter(color => color && color.length > 0)
        .slice(0, 20)
        .map(color => ({
            hex: color,
            rgb: hexToRgb(color),
            type: categorizeColor(color)
        }));

    return colorArray;
}

// Extract fonts from CSS and HTML
async function extractFonts($, baseUrl) {
    const fonts = new Set();
    
    // Get fonts from inline styles
    $('*').each((i, element) => {
        const style = $(element).attr('style');
        if (style) {
            extractFontsFromCSS(style, fonts);
        }
    });

    // Get fonts from style tags
    $('style').each((i, element) => {
        const cssContent = $(element).html();
        if (cssContent) {
            extractFontsFromCSS(cssContent, fonts);
        }
    });

    // Get fonts from external stylesheets
    const stylesheets = [];
    $('link[rel="stylesheet"]').each((i, element) => {
        const href = $(element).attr('href');
        if (href) {
            try {
                const fullUrl = new URL(href, baseUrl).href;
                stylesheets.push(fullUrl);
            } catch (e) {
                // Invalid URL, skip
            }
        }
    });

    // Fetch external CSS files
    for (let i = 0; i < Math.min(stylesheets.length, 3); i++) {
        try {
            const cssResponse = await axios.get(stylesheets[i], {
                timeout: 8000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            extractFontsFromCSS(cssResponse.data, fonts);
        } catch (error) {
            console.log(`Could not fetch CSS from ${stylesheets[i]}`);
        }
    }

    // Convert to array with usage information
    const fontArray = Array.from(fonts)
        .filter(font => font && font.length > 0)
        .slice(0, 10)
        .map(font => ({
            name: font,
            sample: generateFontSample(font),
            usage: categorizeFontUsage(font)
        }));

    return fontArray;
}

// Helper function to extract colors from CSS text
function extractColorsFromCSS(cssText, colors) {
    // Hex colors
    const hexMatches = cssText.match(/#[0-9a-fA-F]{6}/g);
    if (hexMatches) {
        hexMatches.forEach(color => colors.add(color.toUpperCase()));
    }

    // Short hex colors
    const shortHexMatches = cssText.match(/#[0-9a-fA-F]{3}/g);
    if (shortHexMatches) {
        shortHexMatches.forEach(color => {
            const expanded = expandShortHex(color);
            colors.add(expanded);
        });
    }

    // RGB colors
    const rgbMatches = cssText.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g);
    if (rgbMatches) {
        rgbMatches.forEach(color => {
            const hex = rgbToHex(color);
            if (hex) colors.add(hex);
        });
    }
}

// Helper function to extract fonts from CSS text
function extractFontsFromCSS(cssText, fonts) {
    const fontMatches = cssText.match(/font-family\s*:\s*([^;}\n]+)/gi);
    if (fontMatches) {
        fontMatches.forEach(match => {
            const fontFamily = match.replace(/font-family\s*:\s*/i, '').trim();
            const fontNames = fontFamily.split(',').map(f => 
                f.trim().replace(/['"]/g, '')
            );
            fontNames.forEach(font => {
                if (font && !font.includes('inherit') && !font.includes('initial')) {
                    fonts.add(font);
                }
            });
        });
    }
}

// Utility functions
function expandShortHex(hex) {
    return hex.replace(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/, '#$1$1$2$2$3$3');
}

function rgbToHex(rgb) {
    const match = rgb.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
    if (match) {
        const r = parseInt(match[1]);
        const g = parseInt(match[2]);
        const b = parseInt(match[3]);
        return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
    }
    return null;
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? 
        `rgb(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)})` : 
        null;
}

function categorizeColor(hex) {
    const r = parseInt(hex.substr(1, 2), 16);
    const g = parseInt(hex.substr(3, 2), 16);
    const b = parseInt(hex.substr(5, 2), 16);
    
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    
    if (brightness > 240) return 'Light';
    if (brightness < 50) return 'Dark';
    if (r > g && r > b) return 'Red Tone';
    if (g > r && g > b) return 'Green Tone';
    if (b > r && b > g) return 'Blue Tone';
    return 'Neutral';
}

function generateFontSample(fontName) {
    const samples = [
        'The quick brown fox jumps over the lazy dog',
        'Modern typography for digital experiences',
        'Clean and readable text design',
        'Professional font selection'
    ];
    return samples[Math.floor(Math.random() * samples.length)];
}

function categorizeFontUsage(fontName) {
    const name = fontName.toLowerCase();
    if (name.includes('serif') || name.includes('times') || name.includes('georgia')) {
        return 'Serif - Traditional and readable';
    }
    if (name.includes('sans') || name.includes('helvetica') || name.includes('arial')) {
        return 'Sans-serif - Modern and clean';
    }
    if (name.includes('mono') || name.includes('courier') || name.includes('consolas')) {
        return 'Monospace - Code and technical text';
    }
    if (name.includes('script') || name.includes('cursive')) {
        return 'Decorative - Headlines and accents';
    }
    return 'General purpose font';
}
