import { BasePhase } from './BasePhase.js';
import { LLMClient } from '../llm/llm-client.js';

export class GenreSelection extends BasePhase {
  constructor(dependencies) {
    super('genre-selection', dependencies);
  }

  async enter(context) {
    const { eventBus, storyState } = this.dependencies;

    // 1. Query LLM for genres
    const genres = await this._generateGenres();

    // 2. Update story state
    storyState.updateState('voting.genres', genres);

    // 3. Announce voting
    eventBus.emit('loop:genres_ready', { genres });

    // 4. Transition to the next phase
    return { nextPhase: 'voting', context: { genres } };
  }

  async _generateGenres() {
    const mockMode = process.env.MOCK_LLM_MODE === 'true';

    if (mockMode) {
      console.log('[GenreSelection] Using mock genres (MOCK_LLM_MODE=true)');
      return this._getMockGenres();
    }

    try {
      console.log('[GenreSelection] Generating genres via LLM...');

      const llmClient = new LLMClient('claude');
      const prompt = this._buildGenrePrompt();

      const response = await llmClient.generateCompletion(
        'You are a creative genre generator for interactive 3D scene building.',
        prompt,
        { maxTokens: 500 }
      );

      const genres = this._parseGenreResponse(response.content);
      console.log('[GenreSelection] Generated genres:', genres.map(g => g.name).join(', '));

      return genres;
    } catch (error) {
      console.error('[GenreSelection] Failed to generate genres via LLM:', error.message);
      console.log('[GenreSelection] Falling back to mock genres');
      return this._getMockGenres();
    }
  }

  _buildGenrePrompt() {
    return `Generate 5 unique and exciting scene genres for an interactive 3D scene building competition.

CRITICAL CONSTRAINTS:
- Each genre name must be 2-4 words maximum
- Each genre name must be 30 characters or less
- Genres should be visually interesting and distinct from each other
- Genres should inspire creative 3D scene compositions
- Mix time periods, moods, and styles for variety

OUTPUT FORMAT (JSON only):
[
  {"id": 1, "name": "Genre Name", "tagline": "Brief description"},
  {"id": 2, "name": "Genre Name", "tagline": "Brief description"},
  {"id": 3, "name": "Genre Name", "tagline": "Brief description"},
  {"id": 4, "name": "Genre Name", "tagline": "Brief description"},
  {"id": 5, "name": "Genre Name", "tagline": "Brief description"}
]

Examples of good genre names (note the brevity):
- "Cyberpunk Noir" (14 chars)
- "Medieval Fantasy" (16 chars)
- "Space Opera" (11 chars)
- "Steampunk Adventure" (19 chars)
- "Post-Apocalyptic" (16 chars)
- "Underwater Ruins" (16 chars)
- "Mystical Forest" (15 chars)
- "Desert Wasteland" (16 chars)

Generate 5 fresh, creative genres now. Return ONLY the JSON array, no other text.`;
  }

  _parseGenreResponse(text) {
    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonText = text.trim();

      // Remove markdown code blocks if present
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```\n?$/g, '');
      }

      const genres = JSON.parse(jsonText);

      // Validate format
      if (!Array.isArray(genres) || genres.length !== 5) {
        throw new Error('Invalid genre array length');
      }

      // Validate each genre
      for (const genre of genres) {
        if (!genre.id || !genre.name || !genre.tagline) {
          throw new Error('Missing required genre fields');
        }
        if (genre.name.length > 30) {
          console.warn(`[GenreSelection] Genre name too long, truncating: ${genre.name}`);
          genre.name = genre.name.substring(0, 30);
        }
      }

      return genres;
    } catch (error) {
      console.error('[GenreSelection] Failed to parse genre response:', error.message);
      console.error('[GenreSelection] Raw response:', text);
      throw error;
    }
  }

  _getMockGenres() {
    return [
      { id: 1, name: "Cyberpunk Noir", tagline: "Neon-lit streets, corporate espionage" },
      { id: 2, name: "Medieval Fantasy", tagline: "Ancient castles, dragon encounters" },
      { id: 3, name: "Space Opera", tagline: "Galactic conflicts, alien civilizations" },
      { id: 4, name: "Steampunk Adventure", tagline: "Victorian tech, airship battles" },
      { id: 5, name: "Post-Apocalyptic", tagline: "Wasteland survival, mutant threats" }
    ];
  }
}
