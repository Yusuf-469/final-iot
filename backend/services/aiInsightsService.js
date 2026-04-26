/**
 * AI Insights Service
 * OpenRouter-powered AI analysis for health data
 */

const OpenRouter = require('@openrouter/sdk');

class AIInsightsService {
    constructor() {
        this.client = null;
        this.apiKey = process.env.OPENROUTER_API_KEY;
    }

    // Lazy initialization of the client
    getClient() {
        if (!this.apiKey) {
            throw new Error('OpenRouter API key not configured');
        }

        if (!this.client) {
            try {
                this.client = new OpenRouter({
                    apiKey: this.apiKey
                });
            } catch (error) {
                console.error('Failed to initialize OpenRouter client:', error);
                throw error;
            }
        }

        return this.client;
    }

    /**
     * Generate AI-powered insights from health data
     */
    async generateInsights(analyticsData, timeRange = '7d') {
        try {
            const client = this.getClient();
            const prompt = this.buildInsightsPrompt(analyticsData, timeRange);

            const response = await client.chat.send({
                model: "openrouter/free",
                messages: [
                    {
                        role: "system",
                        content: "You are a medical AI assistant analyzing health monitoring data. Provide concise, actionable insights based on the provided metrics. Focus on trends, anomalies, and health recommendations."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                maxTokens: 500,
                temperature: 0.3,
                stream: false // Disable streaming for serverless compatibility
            });

            const insights = response.choices?.[0]?.message?.content || "Unable to generate AI insights at this time.";

            return {
                insights: insights,
                source: 'ai_generated',
                timestamp: new Date(),
                confidence: 0.85
            };

        } catch (error) {
            console.error('AI insights generation failed:', error);
            return this.generateFallbackInsights(analyticsData, timeRange);
        }
    }

    /**
     * Build the prompt for AI analysis
     */
    buildInsightsPrompt(data, timeRange) {
        const { readings = [] } = data;

        if (readings.length === 0) {
            return `No health data available for analysis in the last ${timeRange}. Please provide insights on data collection and monitoring setup.`;
        }

        // Calculate basic stats
        const heartRates = readings.map(r => r.heartRate).filter(v => v != null);
        const temperatures = readings.map(r => r.temperature).filter(v => v != null);
        const spo2s = readings.map(r => r.spo2).filter(v => v != null);

        const avgHR = heartRates.length > 0 ? heartRates.reduce((a, b) => a + b, 0) / heartRates.length : 0;
        const avgTemp = temperatures.length > 0 ? temperatures.reduce((a, b) => a + b, 0) / temperatures.length : 0;
        const avgSpo2 = spo2s.length > 0 ? spo2s.reduce((a, b) => a + b, 0) / spo2s.length : 0;

        const minHR = Math.min(...heartRates);
        const maxHR = Math.max(...heartRates);
        const minTemp = Math.min(...temperatures);
        const maxTemp = Math.max(...temperatures);

        return `
Analyze the following health monitoring data from the last ${timeRange}:

DATA SUMMARY:
- Total readings: ${readings.length}
- Heart Rate: Avg ${avgHR.toFixed(1)} BPM (Range: ${minHR}-${maxHR} BPM)
- Temperature: Avg ${avgTemp.toFixed(1)}°C (Range: ${minTemp.toFixed(1)}-${maxTemp.toFixed(1)}°C)
- SpO2: Avg ${avgSpo2.toFixed(1)}% (Range: ${Math.min(...spo2s)}-${Math.max(...spo2s)}%)

RECENT TREND (last 5 readings):
${readings.slice(-5).map(r => `- HR: ${r.heartRate || 'N/A'} BPM, Temp: ${r.temperature || 'N/A'}°C, SpO2: ${r.spo2 || 'N/A'}%`).join('\n')}

Please provide:
1. Overall health status assessment
2. Key trends or concerning patterns
3. Specific recommendations for the patient
4. Any immediate actions needed

Keep the response concise but informative.`;
    }

    /**
     * Generate fallback insights when AI is not available
     */
    generateFallbackInsights(data, timeRange) {
        const { readings = [] } = data;

        if (readings.length === 0) {
            return {
                insights: `No health data available for the selected ${timeRange} period. Ensure your devices are connected and transmitting data regularly.`,
                source: 'fallback',
                timestamp: new Date(),
                confidence: 0.5
            };
        }

        // Calculate basic stats
        const heartRates = readings.map(r => r.heartRate).filter(v => v != null);
        const temperatures = readings.map(r => r.temperature).filter(v => v != null);
        const spo2s = readings.map(r => r.spo2).filter(v => v != null);

        const avgHR = heartRates.length > 0 ? heartRates.reduce((a, b) => a + b, 0) / heartRates.length : 0;
        const avgTemp = temperatures.length > 0 ? temperatures.reduce((a, b) => a + b, 0) / temperatures.length : 0;
        const avgSpo2 = spo2s.length > 0 ? spo2s.reduce((a, b) => a + b, 0) / spo2s.length : 0;

        let insights = `Analysis of ${readings.length} readings over ${timeRange}:\n\n`;

        // Heart rate analysis
        if (avgHR > 0) {
            insights += `• Heart Rate: Average ${avgHR.toFixed(1)} BPM`;
            if (avgHR > 100) insights += " (Elevated - monitor closely)";
            else if (avgHR < 60) insights += " (Low - consult healthcare provider)";
            else insights += " (Within normal range)";
            insights += "\n";
        }

        // Temperature analysis
        if (avgTemp > 0) {
            insights += `• Temperature: Average ${avgTemp.toFixed(1)}°C`;
            if (avgTemp > 37.5) insights += " (Fever detected - monitor symptoms)";
            else if (avgTemp < 36.1) insights += " (Low temperature - ensure adequate warmth)";
            else insights += " (Normal range)";
            insights += "\n";
        }

        // SpO2 analysis
        if (avgSpo2 > 0) {
            insights += `• SpO2: Average ${avgSpo2.toFixed(1)}%`;
            if (avgSpo2 < 95) insights += " (Below normal - ensure proper oxygenation)";
            else insights += " (Good oxygen saturation)";
            insights += "\n";
        }

        insights += "\nRecommendations: Continue monitoring and consult healthcare provider for any concerning symptoms.";

        return {
            insights: insights,
            source: 'fallback',
            timestamp: new Date(),
            confidence: 0.7
        };
    }
}

module.exports = new AIInsightsService();