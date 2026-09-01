// components/AIAssistantModal.js
// Interactive AI Query Assistant modal powered by LangChain

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, FONT_SIZES, SPACING, RADIUS, SHADOWS } from '../constants/theme';
import { askAIQuery } from '../services/aiService';

const QUICK_PROMPTS = [
  "Which trips are flagged for review?",
  "How many km did Ramesh travel?",
  "Total reimbursement payout this month",
  "Are there any impossible speed anomalies?",
];

export default function AIAssistantModal({ visible, onClose }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [selectedModel, setSelectedModel] = useState('gpt-4o-mini');

  const handleAsk = async (textToAsk) => {
    const question = textToAsk || query;
    if (!question.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const response = await askAIQuery(question, selectedModel);
      setResult(response);
    } catch (error) {
      setResult({
        answer: `App Error: ${error.message}`,
        model_used: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setQuery('');
    setResult(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleContainer}>
              <View style={styles.aiIconBadge}>
                <Ionicons name="sparkles" size={18} color="#FFFFFF" />
              </View>
              <View>
                <Text style={styles.headerTitle}>AI Travel Assistant</Text>
                <Text style={styles.headerSubtitle}>Ask anything about trips, earnings & anomalies</Text>
              </View>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Ionicons name="close" size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Model Switcher */}
          <View style={styles.modelSwitcherContainer}>
            <Text style={styles.modelLabel}>Model:</Text>
            <TouchableOpacity
              style={[
                styles.modelChip,
                selectedModel === 'gpt-4o-mini' && styles.modelChipActive,
              ]}
              onPress={() => setSelectedModel('gpt-4o-mini')}
            >
              <Text
                style={[
                  styles.modelChipText,
                  selectedModel === 'gpt-4o-mini' && styles.modelChipTextActive,
                ]}
              >
                ⚡ gpt-4o-mini (Fast)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modelChip,
                selectedModel === 'gpt-4o' && styles.modelChipActive,
              ]}
              onPress={() => setSelectedModel('gpt-4o')}
            >
              <Text
                style={[
                  styles.modelChipText,
                  selectedModel === 'gpt-4o' && styles.modelChipTextActive,
                ]}
              >
                🧠 gpt-4o (Deep)
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
            {/* Input Form */}
            <View style={styles.inputCard}>
              <TextInput
                style={styles.textInput}
                placeholder="Ask anything about employee trips or earnings..."
                placeholderTextColor="#9fa5e0"
                value={query}
                onChangeText={setQuery}
                multiline
                numberOfLines={2}
                returnKeyType="search"
                onSubmitEditing={() => handleAsk()}
              />
              <TouchableOpacity
                style={[styles.askButton, (!query.trim() || loading) && styles.askButtonDisabled]}
                onPress={() => handleAsk()}
                disabled={!query.trim() || loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Text style={styles.askButtonText}>Ask AI</Text>
                    <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Quick Suggestions */}
            {!result && (
              <View style={styles.quickPromptsSection}>
                <Text style={styles.sectionHeading}>Suggested Questions:</Text>
                <View style={styles.chipsContainer}>
                  {QUICK_PROMPTS.map((prompt, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.promptChip}
                      onPress={() => {
                        setQuery(prompt);
                        handleAsk(prompt);
                      }}
                    >
                      <Ionicons name="chatbubble-ellipses-outline" size={14} color={COLORS.primary} />
                      <Text style={styles.promptChipText}>{prompt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* AI Result Card */}
            {result && (
              <View style={styles.resultCard}>
                <View style={styles.resultHeader}>
                  <Ionicons name="chatbubbles" size={18} color={COLORS.primary} />
                  <Text style={styles.resultTitle}>AI Analysis</Text>
                </View>

                <Text style={styles.resultAnswer}>{result.answer}</Text>

                {/* Source Rows */}
                {result.source_rows_used && result.source_rows_used.length > 0 && (
                  <View style={styles.sourceRowsContainer}>
                    <Text style={styles.sourceRowsLabel}>Traceable Sheet Rows:</Text>
                    <View style={styles.sourceBadgesRow}>
                      {result.source_rows_used.map((rowId, i) => (
                        <View key={i} style={styles.rowBadge}>
                          <Ionicons name="document-text-outline" size={12} color="#333788" />
                          <Text style={styles.rowBadgeText}>Row #{rowId}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Telemetry Footer */}
                <View style={styles.telemetryFooter}>
                  <Text style={styles.telemetryText}>
                    ⏱️ {result.latency_ms ? `${result.latency_ms}ms` : 'Local'} • 🪙 {result.total_tokens || 0} tokens • 🤖 {result.model_used || selectedModel}
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: 24,
    ...SHADOWS.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0fa',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  aiIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#333788',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#5c5f8a',
  },
  closeButton: {
    padding: 6,
  },
  modelSwitcherContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#f8f8fd',
    gap: 8,
  },
  modelLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5c5f8a',
  },
  modelChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#e0e1f5',
  },
  modelChipActive: {
    backgroundColor: '#333788',
    borderColor: '#333788',
  },
  modelChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5c5f8a',
  },
  modelChipTextActive: {
    color: '#FFFFFF',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  inputCard: {
    backgroundColor: '#f8f8fd',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e0e1f5',
    marginBottom: 16,
  },
  textInput: {
    fontSize: 14,
    color: '#1a1a2e',
    minHeight: 48,
    textAlignVertical: 'top',
  },
  askButton: {
    backgroundColor: '#333788',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignSelf: 'flex-end',
    marginTop: 8,
    gap: 6,
  },
  askButtonDisabled: {
    backgroundColor: '#a0a3cc',
  },
  askButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  quickPromptsSection: {
    marginTop: 8,
    marginBottom: 20,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5c5f8a',
    marginBottom: 10,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  promptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eef0ff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: '#d8dcfa',
  },
  promptChipText: {
    fontSize: 12,
    color: '#333788',
    fontWeight: '500',
  },
  resultCard: {
    backgroundColor: '#f6f7fd',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#dcdffa',
    marginBottom: 24,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333788',
  },
  resultAnswer: {
    fontSize: 14,
    lineHeight: 22,
    color: '#1a1a2e',
  },
  sourceRowsContainer: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7fa',
  },
  sourceRowsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5c5f8a',
    marginBottom: 6,
  },
  sourceBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  rowBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eef0ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  rowBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#333788',
  },
  telemetryFooter: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e5e7fa',
  },
  telemetryText: {
    fontSize: 11,
    color: '#8b8ea8',
  },
});
