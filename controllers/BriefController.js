const fs = require("fs");
const Tesseract = require("tesseract.js");
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Helper function to detect file type category
function getFileCategory(mimeType) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) return 'document';
  return 'unknown';
}

async function handleFiles(file, mimeType, length) {
  const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature: 0.4,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192,
    }
  });

  const fileCategory = getFileCategory(mimeType);
  
  const systemPrompt = `You are an ENTERPRISE-LEVEL AI summarization specialist designed for professional business environments. Your summaries are used by executives, analysts, and decision-makers who require high-quality, actionable insights.

🎯 YOUR MISSION: Transform content from various media formats into executive-level summaries that deliver maximum value in minimum time.

📋 SUPPORTED INPUT FORMATS:
• Images: PNG, JPG, JPEG, GIF, WebP (extract text via OCR, analyze charts/diagrams)
• Videos: MP4, AVI, MOV, WebM (analyze frames, extract spoken content)
• Audio: MP3, WAV, AAC, OGG (transcribe and summarize spoken content)
• Documents: PDF, DOC, DOCX, TXT (extract and synthesize written content)

✨ ENTERPRISE QUALITY STANDARDS:

1. STRUCTURE & CLARITY
   • Start IMMEDIATELY with content—no preambles like "Here is..." or "Of course"
   • Use visual hierarchy with emojis and icons (🔹 for sections, • for bullets, → for flows)
   • NO markdown syntax (###, **, ---). Use plain text with emojis for visual appeal
   • Proper spacing: double line breaks between sections, single between bullets
   • Target length: approximately ${length} words (±10% acceptable for quality)

2. CONTENT DEPTH (Enterprise-Level)
   • Extract KEY INSIGHTS, not just surface information
   • Identify ACTIONABLE items and recommendations
   • Highlight CRITICAL data points, statistics, and findings
   • Capture MAIN THEMES and underlying patterns
   • Note any IMPORTANT DATES, NAMES, or REFERENCES

3. PROFESSIONAL PRESENTATION
   • Use professional business language
   • Organize information logically (most important first)
   • Include context where necessary
   • Maintain objectivity and factual accuracy
   • Preserve technical terms and industry jargon appropriately

4. MEDIA-SPECIFIC PROCESSING:
   • IMAGES: Extract all visible text, analyze charts/graphs, describe key visual elements
   • VIDEOS: Combine frame analysis + audio transcription, capture demonstrations/presentations
   • AUDIO: Transcribe speech accurately, identify speakers if multiple, capture tone/emotion
   • DOCUMENTS: Synthesize main arguments, extract conclusions, note methodology

5. QUALITY CONTROLS
   • If content is empty, unclear, or nonsensical: return "⚠️ Unable to generate summary: No meaningful content detected"
   • If content is in another language: Summarize in the SAME language
   • For poor quality media: Work with available information, note limitations
   • Maintain information hierarchy: Critical → Important → Supporting details

6. OUTPUT FORMAT EXAMPLE:
🎯 Executive Summary
[2-3 sentence overview of the entire content]

🔹 Key Findings
• Major point one → implication or action item
• Major point two → implication or action item
• Major point three → implication or action item

🔹 Critical Details
• Specific data, dates, or technical information
• Supporting evidence or methodology
• Relevant context or background

📊 Insights & Recommendations
• Strategic takeaway or lesson learned
• Suggested next steps or considerations

⚠️ NEVER mention: AI, OCR, transcription, analysis methods, or tool names in your output.

Begin your enterprise-level summary now:`;

  const chat = model.startChat({
    history: [
      {
        role: "user",
        parts: [{ text: systemPrompt }],
      },
    ],
  });

  const result = await chat.sendMessage([
    {
      inlineData: {
        mimeType: mimeType,
        data: file.toString("base64"),
      }
    }
  ]);
  
  return result;
}



async function handleText(textInput) {
  const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature: 0.4,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192,
    }
  });

  const systemPrompt = `You are an ELITE TEXT ANALYSIS AI designed for enterprise environments. You transform raw text into executive-level summaries that professionals rely on for critical decision-making.

🎯 YOUR ROLE: Analyze and synthesize text content into high-quality, actionable summaries for business professionals, researchers, and executives.

✨ ENTERPRISE QUALITY STANDARDS:

1. IMMEDIATE IMPACT
   • Start DIRECTLY with insights—no introductions ("Here is...", "Of course...", "Sure...")
   • Lead with the most critical information
   • Use professional business language
   • Maintain objective, factual tone

2. STRUCTURE & PRESENTATION
   • Visual hierarchy: 🔹 for major sections, • for bullets, → for processes/flows
   • NO markdown (###, **, ---). Use emojis + plain text for visual structure
   • Logical organization: Overview → Key Points → Details → Conclusions
   • Professional spacing: double line breaks between sections

3. CONTENT ANALYSIS DEPTH
   • Extract MAIN THEMES and central arguments
   • Identify KEY FINDINGS and critical data points
   • Highlight ACTIONABLE INSIGHTS and recommendations
   • Note IMPORTANT ENTITIES (names, dates, locations, organizations)
   • Capture SUPPORTING EVIDENCE and methodology
   • Recognize IMPLICATIONS and potential impacts

4. INTELLIGENCE LEVELS
   • For Articles/News: Who, What, When, Where, Why, Impact
   • For Research: Hypothesis, Methodology, Findings, Conclusions, Limitations
   • For Business Docs: Objectives, Strategies, Metrics, Recommendations, Next Steps
   • For Technical Content: Core concepts, Implementation, Benefits, Trade-offs
   • For Reports: Executive Summary, Key Metrics, Trends, Recommendations

5. LANGUAGE HANDLING
   • Detect input language automatically
   • Summarize in the SAME language as input
   • Preserve technical terminology accurately
   • Maintain appropriate formality level

6. QUALITY ASSURANCE
   • Verify factual accuracy from source text
   • Avoid speculation or assumptions
   • If text is unclear/nonsensical: return "⚠️ Unable to generate summary: Content quality insufficient"
   • If text is too short: return concise essence without padding
   • Aim for comprehensive yet concise delivery

7. OUTPUT FORMAT STRUCTURE:
🎯 Core Message
[1-2 sentences capturing the essence]

🔹 Key Points
• Critical finding or argument one
• Critical finding or argument two
• Critical finding or argument three

🔹 Important Details
• Supporting information, data, or evidence
• Relevant context or background
• Technical specifications or methodology

💡 Takeaways
• Strategic insight or lesson learned
• Recommended actions or considerations

⚠️ NEVER reference: AI, summarization tools, analysis methods, or processing techniques.

Begin your professional analysis now:`;

  const chat = model.startChat({
    history: [
      {
        role: "user",
        parts: [{ text: systemPrompt }],
      },
    ],
  });

  const result = await chat.sendMessage([{ text: textInput }]);
  return result;
}




processFiles = async (req, res) => {
  try {
    const file = req.file?.buffer;
    const mimeType = req.file?.mimetype;
    const length = req.body.length || 200; // Default to 200 words if not specified

    // Handle text input
    if (req.body.text && req.body.textInput) {
      console.log(`📝 Processing text input (${req.body.textInput.length} characters)`);
      
      if (!req.body.textInput.trim()) {
        return res.status(400).json({ 
          status: false, 
          error: "Text input is empty" 
        });
      }

      const response = await handleText(req.body.textInput);
      const summary = response.response.text();
      
      console.log(`✅ Text summary generated (${summary.length} characters)`);
      
      return res.status(200).json({ 
        status: true, 
        extractedText: summary,
        type: 'text',
        wordCount: summary.split(/\s+/).length
      });
    }
    
    // Handle file upload
    if (file && mimeType) {
      const fileCategory = getFileCategory(mimeType);
      const fileSizeKB = (file.length / 1024).toFixed(2);
      
      console.log(`📁 Processing ${fileCategory} file: ${mimeType} (${fileSizeKB} KB)`);

      // Validate supported file types
      const supportedTypes = [
        'image/png', 'image/jpg', 'image/jpeg', 'image/gif', 'image/webp',
        'video/mp4', 'video/avi', 'video/quicktime', 'video/webm',
        'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/aac', 'audio/ogg',
        'application/pdf', 'application/msword', 
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain'
      ];

      if (!supportedTypes.some(type => mimeType.includes(type.split('/')[1]))) {
        return res.status(400).json({
          status: false,
          error: `Unsupported file type: ${mimeType}`,
          supportedFormats: {
            images: 'PNG, JPG, JPEG, GIF, WebP',
            videos: 'MP4, AVI, MOV, WebM',
            audio: 'MP3, WAV, AAC, OGG',
            documents: 'PDF, DOC, DOCX, TXT'
          }
        });
      }

      const response = await handleFiles(file, mimeType, length);
      const summary = response.response.text();
      
      console.log(`✅ ${fileCategory} summary generated (${summary.length} characters)`);
      
      return res.status(200).json({ 
        status: true, 
        extractedText: summary,
        type: fileCategory,
        mimeType: mimeType,
        fileSize: fileSizeKB + ' KB',
        wordCount: summary.split(/\s+/).length
      });
    }

    // No valid input provided
    return res.status(400).json({
      status: false,
      error: "No valid input provided. Please upload a file or provide text input."
    });

  } catch (error) {
    console.error("❌ Error processing content:", error);
    
    // Handle specific Gemini API errors
    if (error.message && error.message.includes('quota')) {
      return res.status(429).json({
        status: false,
        error: "API quota exceeded. Please try again later.",
        details: "The AI service has reached its rate limit. Please wait a few minutes and try again."
      });
    }

    if (error.message && error.message.includes('not found')) {
      return res.status(500).json({
        status: false,
        error: "AI model configuration error",
        details: "The summarization service is temporarily unavailable. Please contact support."
      });
    }

    // Generic error response
    return res.status(500).json({
      status: false,
      error: "Failed to process content",
      message: error.message || "An unexpected error occurred"
    });
  }
};

module.exports = { processFiles };