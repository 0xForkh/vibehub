import * as fs from 'fs';
import * as path from 'path';
import { createSdkMcpServer, tool, type McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';
import OpenAI, { toFile } from 'openai';
import { z } from 'zod';
import { logger as getLogger } from '../../../shared/logger.js';

const logger = getLogger();

/**
 * Get MIME type from file extension
 */
function getMimeType(filePath: string): 'image/png' | 'image/jpeg' | 'image/webp' {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    default:
      // Default to png if unknown
      return 'image/png';
  }
}

/**
 * Context required for image tools to operate
 */
export interface ImageToolsContext {
  workingDir: string;
  currentSessionId: string;
}

// Lazily initialized OpenAI client
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

/**
 * Ensure the output directory exists
 */
function ensureOutputDir(workingDir: string): string {
  const outputDir = path.join(workingDir, '.generated');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    logger.info('Created .generated directory', { outputDir });
  }
  return outputDir;
}

/**
 * Ensure filename has the correct extension for the format
 */
function ensureExtension(filename: string, format: string): string {
  const ext = path.extname(filename).toLowerCase();
  const expectedExt = `.${format}`;

  // If no extension or wrong extension, add/replace it
  if (!ext) {
    return `${filename}${expectedExt}`;
  }
  if (ext !== expectedExt) {
    return `${path.basename(filename, ext)}${expectedExt}`;
  }
  return filename;
}

/**
 * Generate a unique filename if the target file already exists
 */
function generateUniqueFilename(outputDir: string, filename: string, format: string): string {
  // First ensure the filename has the correct extension
  const correctedFilename = ensureExtension(filename, format);
  const ext = path.extname(correctedFilename);
  const base = path.basename(correctedFilename, ext);
  let finalPath = path.join(outputDir, correctedFilename);
  let counter = 1;

  while (fs.existsSync(finalPath)) {
    finalPath = path.join(outputDir, `${base}_${counter}${ext}`);
    counter += 1;
  }

  return finalPath;
}

/**
 * Creates an MCP server with image generation tools
 */
export function createImageToolsServer(context: ImageToolsContext): McpSdkServerConfigWithInstance {
  const { workingDir } = context;

  return createSdkMcpServer({
    name: 'image-tools',
    version: '1.0.0',
    tools: [
      // Tool 1: generate_image
      tool(
        'generate_image',
        'Generate an image using OpenAI\'s GPT Image API (gpt-image-1.5). The image will be saved to the .generated folder in the working directory.',
        {
          prompt: z.string().describe('Text description of the image to generate'),
          filename: z.string().optional().describe('Output filename (e.g., "my_image.png"). Defaults to a timestamp-based name.'),
          size: z.enum(['1024x1024', '1024x1536', '1536x1024', 'auto']).optional()
            .describe('Image size. Defaults to "auto" which lets the model choose.'),
          quality: z.enum(['low', 'medium', 'high', 'auto']).optional()
            .describe('Image quality. Higher quality takes longer. Defaults to "auto".'),
          background: z.enum(['transparent', 'opaque', 'auto']).optional()
            .describe('Background type. Use "transparent" for PNG with transparency. Defaults to "auto".'),
          output_format: z.enum(['png', 'jpeg', 'webp']).optional()
            .describe('Output format. Defaults to "png".'),
        },
        async (args) => {
          logger.info('generate_image tool called', { prompt: args.prompt.slice(0, 100) });

          try {
            const client = getOpenAIClient();
            const outputDir = ensureOutputDir(workingDir);

            // Determine output format and filename
            const format = args.output_format || 'png';
            const defaultFilename = `generated_${Date.now()}`;
            const filename = args.filename || defaultFilename;
            const outputPath = generateUniqueFilename(outputDir, filename, format);

            // Call OpenAI API
            const response = await client.images.generate({
              model: 'gpt-image-1.5',
              prompt: args.prompt,
              size: args.size || 'auto',
              quality: args.quality || 'auto',
              background: args.background || 'auto',
              output_format: format,
              n: 1,
            });

            // Get the base64 image data
            const imageData = response.data?.[0];
            if (!imageData?.b64_json) {
              throw new Error('No image data returned from API');
            }

            // Save the image
            const buffer = Buffer.from(imageData.b64_json, 'base64');
            fs.writeFileSync(outputPath, buffer);

            // Get relative path from working directory
            const relativePath = path.relative(workingDir, outputPath);

            logger.info('Image generated successfully', {
              outputPath,
              relativePath,
              size: buffer.length,
            });

            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: true,
                  path: outputPath,
                  relativePath,
                  filename: path.basename(outputPath),
                  format,
                  size: buffer.length,
                }),
              }],
            };
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            const stack = err instanceof Error ? err.stack : undefined;
            // Extract OpenAI API error details if available
            const apiError = (err as { status?: number; error?: unknown })?.error;
            const statusCode = (err as { status?: number })?.status;

            logger.error('Failed to generate image', {
              error,
              stack,
              statusCode,
              apiError: apiError ? JSON.stringify(apiError) : undefined,
              prompt: args.prompt.slice(0, 200),
            });

            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error,
                  statusCode,
                }),
              }],
            };
          }
        }
      ),

      // Tool 2: edit_image
      tool(
        'edit_image',
        'Edit an existing image using OpenAI\'s GPT Image API. Provide a source image and a prompt describing the desired changes. The edited image will be saved to the .generated folder.',
        {
          prompt: z.string().describe('Text description of the edits to make to the image'),
          source_image: z.string().describe('Path to the source image file (relative to working directory or absolute)'),
          filename: z.string().optional().describe('Output filename for the edited image. Defaults to a timestamp-based name.'),
          size: z.enum(['1024x1024', '1024x1536', '1536x1024', 'auto']).optional()
            .describe('Output image size. Defaults to "auto".'),
          quality: z.enum(['low', 'medium', 'high', 'auto']).optional()
            .describe('Image quality. Defaults to "auto".'),
          output_format: z.enum(['png', 'jpeg', 'webp']).optional()
            .describe('Output format. Defaults to "png".'),
        },
        async (args) => {
          logger.info('edit_image tool called', {
            prompt: args.prompt.slice(0, 100),
            source: args.source_image,
          });

          try {
            const client = getOpenAIClient();
            const outputDir = ensureOutputDir(workingDir);

            // Resolve source image path
            const sourcePath = path.isAbsolute(args.source_image)
              ? args.source_image
              : path.join(workingDir, args.source_image);

            if (!fs.existsSync(sourcePath)) {
              throw new Error(`Source image not found: ${sourcePath}`);
            }

            // Determine output format and filename
            const format = args.output_format || 'png';
            const defaultFilename = `edited_${Date.now()}`;
            const filename = args.filename || defaultFilename;
            const outputPath = generateUniqueFilename(outputDir, filename, format);

            // Read file and create properly typed file for OpenAI API
            const fileBuffer = fs.readFileSync(sourcePath);
            const mimeType = getMimeType(sourcePath);
            const imageFile = await toFile(fileBuffer, path.basename(sourcePath), { type: mimeType });

            // Call OpenAI edit API with properly typed file
            const response = await client.images.edit({
              model: 'gpt-image-1.5',
              prompt: args.prompt,
              image: imageFile,
              size: args.size || 'auto',
              quality: args.quality || 'auto',
              output_format: format,
              n: 1,
            });

            // Get the base64 image data
            const imageData = response.data?.[0];
            if (!imageData?.b64_json) {
              throw new Error('No image data returned from API');
            }

            // Save the image
            const buffer = Buffer.from(imageData.b64_json, 'base64');
            fs.writeFileSync(outputPath, buffer);

            // Get relative path from working directory
            const relativePath = path.relative(workingDir, outputPath);

            logger.info('Image edited successfully', {
              outputPath,
              relativePath,
              size: buffer.length,
            });

            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: true,
                  path: outputPath,
                  relativePath,
                  filename: path.basename(outputPath),
                  sourceImage: args.source_image,
                  format,
                  size: buffer.length,
                }),
              }],
            };
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            const stack = err instanceof Error ? err.stack : undefined;
            // Extract OpenAI API error details if available
            const apiError = (err as { status?: number; error?: unknown })?.error;
            const statusCode = (err as { status?: number })?.status;

            logger.error('Failed to edit image', {
              error,
              stack,
              statusCode,
              apiError: apiError ? JSON.stringify(apiError) : undefined,
              sourcePath: args.source_image,
              prompt: args.prompt.slice(0, 200),
            });

            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error,
                  statusCode,
                }),
              }],
            };
          }
        }
      ),
    ],
  });
}
