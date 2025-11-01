export function formatAIResponseToJSON(response: string) {
  try {
    const cleanResponse = response.trim();

    if (cleanResponse.startsWith('{') || cleanResponse.startsWith('[')) {
      return JSON.parse(cleanResponse);
    }

    const jsonMatch = cleanResponse.match(/(\[([\s\S]*?)\]|\{([\s\S]*?)\})/);
    
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }

    throw new Error('No valid JSON structure found in AI response');
  } catch (error: any) {
    console.error('❌ Failed to parse AI response to JSON:', error.message);
    return null;
  }
}