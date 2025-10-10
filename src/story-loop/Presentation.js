import { BasePhase } from './BasePhase.js';

export class Presentation extends BasePhase {
  constructor(dependencies) {
    super('presentation', dependencies);
  }

  async enter(context) {
    const { eventBus, storyState, mcpClients } = this.dependencies;

    // Configured fallback duration (in milliseconds) with a reduced default window
    const configuredPresentationDurationMs =
      Number.parseInt(process.env.STORY_LOOP_PRESENTATION_DURATION || '20', 10) * 1000;

    const webServerSettings = global.webServerInstance?.currentSettings || {};

    const envAudioMode = process.env.PRESENTATION_AUDIO_MODE;
    let audioMode = webServerSettings.audioMode || envAudioMode;
    if (!audioMode && process.env.PRESENTATION_COMMENTARY_ENABLED === 'true') {
      audioMode = 'mixed';
    }
    const validModes = ['story', 'commentary', 'mixed'];
    if (!validModes.includes(audioMode)) {
      audioMode = 'story';
    }

    // 1. Announce presentation
    eventBus.emit('loop:presentation_started', { duration: configuredPresentationDurationMs });

    // 2. Get the winning proposal and scene information
    const competitionState = storyState.getPath('competition');
    const winningProposal = competitionState?.winner;
    const votingState = storyState.getPath('voting');
    const selectedGenre = votingState?.winner;
    let cameraShots = [];
    let totalShotDurationMs = 0;
    let usedFallbackShot = false;

    if (winningProposal && selectedGenre) {
      // 3. Build audio payload based on selected audio mode
      const audioBuild = this._buildAudioPayload(winningProposal, selectedGenre, audioMode);
      const audioPayload = audioBuild.payload;
      const activeChannels = audioBuild.channels;

      // 4. Request audio generation
      const audioRequestId = `presentation_${Date.now()}`;
      if (audioPayload) {
        console.log(`[Presentation] Audio mode "${audioMode}" with channels: ${activeChannels.join(', ')}`);
        if (activeChannels.length > 0 && !audioPayload.sync) {
          audioPayload.sync = {
            id: audioRequestId,
            channels: activeChannels
          };
        }

        eventBus.emit('orchestrator:audio:request', {
          requestId: audioRequestId,
          stageId: 'presentation',
          payload: audioPayload
        });
      }

      // 5. Execute camera shots from winning proposal
      try {
        cameraShots = winningProposal.data?.shots || winningProposal.shots || [];

        if (cameraShots.length > 0) {
          totalShotDurationMs = cameraShots.reduce((sum, shot) => {
            const durationSeconds = Number.isFinite(shot.duration) ? shot.duration : Number.parseFloat(shot.duration);
            return sum + (Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds * 1000 : 0);
          }, 0);

          console.log(`[Presentation] Executing ${cameraShots.length} camera shots`);

          for (const shot of cameraShots) {
            const shotType = shot.shotType;
            console.log(`[Presentation] Executing ${shotType} shot:`, shot.description || '');

            // Map shot types to MCP tool names
            const toolMapping = {
              'smoothMove': 'worldviewer_smooth_move',
              'arcShot': 'worldviewer_arc_shot',
              'orbitShot': 'worldviewer_orbit_shot'
            };

            const toolName = toolMapping[shotType];
            if (!toolName) {
              console.warn(`[Presentation] Unknown shot type: ${shotType}`);
              continue;
            }

            // Prepare shot parameters (remove shotType and description, keep all camera params)
            const shotParams = { ...shot };
            delete shotParams.shotType;
            delete shotParams.description;
            shotParams.execution_mode = 'auto'; // Queue shots for smooth playback

            // Execute the shot using executeCommand (passes params as-is)
            await mcpClients.worldViewer.executeCommand(toolName, shotParams);
          }
        } else {
          console.warn('[Presentation] No camera shots found in winning proposal, using default establishing shot');
          usedFallbackShot = true;
          totalShotDurationMs = Math.max(totalShotDurationMs, 6000);
          // Fallback: simple establishing shot
          await mcpClients.worldViewer.executeCommand('worldviewer_smooth_move', {
            start_position: [-15, -12, 8],
            end_position: [-8, -6, 5],
            start_target: [0, 0, 4],
            end_target: [0, 0, 4],
            duration: 6.0,
            easing_type: 'ease_in_out',
            execution_mode: 'auto'
          });
        }
      } catch (error) {
        console.warn('[Presentation] Camera shot execution failed:', error.message);
      }
    } else {
      console.warn('[Presentation] No winning proposal or genre found, skipping audio/camera');
    }

    // 6. Wait for the presentation to finish
    const minimumWaitMs = 5000;
    const bufferMs = 2000;
    const waitForShotsMs =
      (cameraShots.length > 0 || usedFallbackShot) ? totalShotDurationMs + bufferMs : 0;
    const waitDurationMs = Math.max(waitForShotsMs, configuredPresentationDurationMs, minimumWaitMs);

    console.log(`[Presentation] Waiting ${Math.round(waitDurationMs / 1000)}s for presentation wrap-up`);
    await new Promise(resolve => setTimeout(resolve, waitDurationMs));

    // 7. Transition to the next phase
    return { nextPhase: 'cleanup', context: {} };
  }

  /**
   * Build audio payload with narration and optional commentary
   */
  _buildAudioPayload(proposal, genre, audioMode) {
    const payload = {};
    const activeChannels = [];

    const genreName = typeof genre === 'string' ? genre : genre?.name || 'this scene';
    const audioSpec = proposal.data?.audioSpec || {
      narration: proposal.data?.narration,
      music: proposal.data?.music,
      ambient: proposal.data?.ambient
    };

    payload.metadata = {
      mode: audioMode,
      genre: genreName,
      proposalAgent: proposal.agentId
    };

    const includeNarration = audioMode === 'story' || audioMode === 'mixed';
    const includeCommentary = audioMode === 'commentary' || audioMode === 'mixed';
    const includeMusic = audioMode === 'story' || audioMode === 'mixed';
    const includeAmbient = true;

    if (includeNarration) {
      const narrationData = audioSpec?.narration;
      const narrationScript = narrationData?.script || narrationData?.text;

      if (narrationScript) {
        payload.narration = {
          text: narrationScript,
          tone: narrationData?.tone || undefined
        };
        if (narrationData?.voice) {
          payload.narration.voice = narrationData.voice;
        }
        if (narrationData?.volume !== undefined) {
          payload.narration.volume = narrationData.volume;
        }
        console.log('[Presentation] Using LLM-generated narration script');
      } else {
        payload.narration = {
          text: `Welcome to ${genreName}. Let your imagination explore this space and discover its stories.`
        };
        console.warn('[Presentation] No narration script found in proposal, using fallback');
      }

      activeChannels.push('narration');
    }

    if (includeCommentary) {
      const commentary = this._buildCommentary(proposal, genre);
      if (commentary) {
        payload.commentary = {
          text: commentary,
          style: 'director_notes'
        };
        activeChannels.push('commentary');
        console.log('[Presentation] Commentary channel enabled for audio mode:', audioMode);
      } else {
        console.warn('[Presentation] Commentary requested but no content generated');
      }
    }

    if (includeMusic) {
      const musicData = audioSpec?.music;
      if (musicData) {
        payload.music = {
          ...musicData
        };
        activeChannels.push('music');
      } else {
        console.warn('[Presentation] Audio mode requires music but proposal data missing music block');
      }
    }

    if (includeAmbient) {
      const ambientData = audioSpec?.ambient;
      if (ambientData) {
        payload.ambient = {
          ...ambientData
        };
        activeChannels.push('ambient');
      } else {
        console.warn('[Presentation] No ambient audio specified; skipping ambient channel');
      }
    }

    if (activeChannels.length === 0) {
      console.warn('[Presentation] No audio channels produced for mode:', audioMode);
      return { payload: null, channels: [] };
    }

    return { payload, channels: activeChannels };
  }

  /**
   * Build technical commentary from proposal reasoning and scene structure
   */
  _buildCommentary(proposal, genre) {
    const genreName = typeof genre === 'string' ? genre : genre.name;
    const parts = [];

    // Add agent's reasoning (design decisions)
    if (proposal.reasoning) {
      parts.push(proposal.reasoning);
    }

    // Add technical scene structure
    if (proposal.data?.batches && Array.isArray(proposal.data.batches)) {
      const batchCount = proposal.data.batches.length;
      const totalElements = proposal.data.batches.reduce(
        (sum, batch) => sum + (batch.elements?.length || 0),
        0
      );
      parts.push(`This ${genreName} scene contains ${batchCount} layers with ${totalElements} elements.`);

      // Add batch descriptions
      const batchDescriptions = proposal.data.batches
        .map(batch => batch.description)
        .filter(desc => desc)
        .join(' ');
      if (batchDescriptions) {
        parts.push(batchDescriptions);
      }
    }

    return parts.join(' ').trim();
  }
}
