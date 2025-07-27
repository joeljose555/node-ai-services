import axios from '../utils/axiosIntercepter.js';
import { Client } from "@gradio/client";
import NewsArticle from '../models/newsArticles.js';
import UserCategoryPreference from '../models/userCategoryPreference.js';
import { logger } from '../utils/logger.js';
import { truncateToWordCount, shuffleArray } from './commonFunctions.js';
import NewsSummaries from '../models/newsSummaries.js';
import BatchTracker from '../models/batchTracker.js';
import mongoose from 'mongoose';
import fs from 'fs';
import aiSummarries from '../models/aiSummarries.js';

interface ArticleSummary {
    userId: string;
    summary: string;
    articleCount: number;
    generatedAt: Date;
    batchId?: string;
}

export class SummaryService {
    private maxArticlesCount: number;

    constructor() {
        this.maxArticlesCount = parseInt(process.env.MAX_ARTICLES_COUNT || '5');
    }

    /**
     * Get articles for a specific user based on their category preferences
     */
    async getArticlesForUser(userId: string): Promise<any[]> {
        try {
            // Get user's category preferences
            const userPreferences = await UserCategoryPreference.findOne({ userId });
            
            if (!userPreferences || !userPreferences.preferredCategories.length) {
                logger.warn(`No category preferences found for user: ${userId}`);
                return [];
            }

            // Extract category IDs from user preferences
            const categoryIds = userPreferences.preferredCategories.map(pref => pref.categoryID);

            // Use aggregation to get 5 articles from each category
            const articles = await NewsArticle.aggregate([
                {
                    $match: {
                        categoryId: { $in: categoryIds }
                    }
                },
                {
                    $sort: { publishedAt: -1 }
                },
                {
                    $group: {
                        _id: '$categoryId',
                        articles: {
                            $push: '$$ROOT'
                        }
                    }
                },
                {
                    $project: {
                        _id: 1,
                        articles: { $slice: ['$articles', 5] }
                    }
                },
                {
                    $unwind: '$articles'
                },
                {
                    $replaceRoot: { newRoot: '$articles' }
                }
            ]);

            // Apply word count limitation to text fields
            const processedArticles = articles.map(article => {
                return {
                    ...article,
                    title: truncateToWordCount(article.title, 20), // Limit title to 20 words
                    description: truncateToWordCount(article.description, 100), // Limit description to 100 words
                    fullText: truncateToWordCount(article.fullText, 500) // Limit full text to 500 words
                };
            });

            return processedArticles;

        } catch (error) {
            logger.error(`Error getting articles for user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Generate summary for a user by combining their selected articles
     */
    async generateSummaryForUser(userId: string, batchId?: string): Promise<ArticleSummary | null> {
        try {
            const articles = await this.getArticlesForUser(userId);
            
            if (!articles.length) {
                logger.info(`No articles found for user: ${userId}`);
                return null;
            }

            // Combine articles into a single summary paragraph
            const summaryParts = articles.map(article => {
                const content = article.fullText || article.description || article.title;
                return `${article.title}: ${content}`;
            });

            const summary = summaryParts.join('\n');

            await NewsSummaries.create({
                userId,
                summary,
                articleCount: articles.length,
                generatedAt: new Date(),
                summaryType: 'user',
                summaryTitle: 'Daily Mix',
            });

            return {
                userId,
                summary,
                articleCount: articles.length,
                generatedAt: new Date(),
                batchId
            };

        } catch (error) {
            logger.error(`Error generating summary for user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Generate summaries for all users with category preferences
     */
    async generateSummariesForAllUsers(batchId?: string): Promise<ArticleSummary[]> {
        try {
            // Get all users with category preferences
            const userPreferences = await UserCategoryPreference.find({
                'preferredCategories.0': { $exists: true }
            }).lean();

            if (!userPreferences.length) {
                logger.info('No users with category preferences found');
                return [];
            }

            const summaries: ArticleSummary[] = [];

            // Generate summary for each user
            for (const userPref of userPreferences) {
                const summary = await this.generateSummaryForUser(userPref.userId.toString(), batchId);
                if (summary) {
                    summaries.push(summary);
                }
            }

            logger.info(`Generated ${summaries.length} summaries for users`);
            return summaries;

        } catch (error) {
            logger.error('Error generating summaries for all users:', error);
            throw error;
        }
    }

    /**
     * Send summary to external service using Hugging Face Gradio client
     */
    public async sendSummaryToService(summary: ArticleSummary): Promise<string> {
        try {
            // Connect to the Gradio client
            const client = await Client.connect("joeljose555/aiScripts", {
                hf_token: process.env.HF_TOKEN as `hf_${string}`
            });
            
            // Call the summarise_interface with the summary text
            const result = await client.predict("/run_summarization_gpu", {
                text: summary.summary,
                user_id: summary.userId,
                batch_id: summary.batchId,
                max_length: 700, // Adjust this value based on your needs
            });

            logger.info(`Summary processed for user ${summary.userId} in batch ${summary.batchId}. Result: ${result.data}`);
            return result.data as string;
        } catch (error) {
            logger.error(`Error processing summary for user ${summary.userId} in batch ${summary.batchId}:`, error);
            throw error;
        }
    }

    /**
     * Send all summaries to external service sequentially with delays
     */
    async sendSummariesToService(summaries: ArticleSummary[]): Promise<void> {
        try {
            logger.info(`Starting to send ${summaries.length} summaries sequentially with 2-second delays`);

            for (let i = 0; i < summaries.length; i++) {
                const summary = summaries[i];
                console.log(summary);
                // Send the summary and wait for it to complete
                fs.writeFileSync('summary.json', JSON.stringify(summary, null, 2));
                await this.sendSummaryToService(summary);
                
                // Wait 2 seconds before sending the next one (except for the last one)
                if (i < summaries.length - 1) {
                    await this.delay(1000);
                }
            }

            logger.info(`All ${summaries.length} summary requests have been sent`);

        } catch (error) {
            logger.error('Error in sequential summary sending process:', error);
            throw error;
        }
    }

    /**
     * Utility function to create delay
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Main scheduled task: Generate and send summaries
     */
    async executeScheduledSummaryTask(): Promise<void> {
        try {
            logger.info('Starting scheduled summary generation task');

            // Generate unique batch ID
            const batchId = this.generateBatchId();
            
            // Generate summaries for all users
            const summaries = await this.generateSummariesForAllUsers(batchId);

            if (!summaries.length) {
                logger.info('No summaries generated, skipping external service call');
                return;
            }

            // Create batch tracker
            await this.createBatchTracker(batchId, summaries);

            // Send summaries to external service
            await this.sendSummariesToService(summaries);

            logger.info(`Completed scheduled summary generation task. Processed ${summaries.length} summaries for batch: ${batchId}`);

        } catch (error) {
            logger.error('Error in scheduled summary task:', error);
            throw error;
        }
    }

    /**
     * Generate unique batch ID
     */
    private generateBatchId(): string {
        return `batch_${Date.now()}_${new mongoose.Types.ObjectId().toString()}`;
    }

    /**
     * Create batch tracker record
     */
    private async createBatchTracker(batchId: string, summaries: ArticleSummary[]): Promise<void> {
        try {
            const timeoutAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now
            const userIds = summaries.map(s => s.userId);

            await BatchTracker.create({
                batchId,
                expectedCount: summaries.length,
                receivedCount: 0,
                status: 'pending',
                timeoutAt,
                userIds
            });

            logger.info(`Created batch tracker for batch: ${batchId} with ${summaries.length} expected summaries`);

        } catch (error) {
            logger.error(`Error creating batch tracker for batch ${batchId}:`, error);
            throw error;
        }
    }

    async getSummaryById(summaryId: string): Promise<any | null> {
        try {
            const summary = await aiSummarries.findOne({_id: summaryId});
            return summary;
        } catch (error) {
            logger.error(`Error getting summary by id ${summaryId}:`, error);
            throw error;
        }
    }
}

// Export singleton instance
export const summaryService = new SummaryService();
