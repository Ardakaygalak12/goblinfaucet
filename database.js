const DATABASE = {
    config: {
        binId: '67b0a195ad19ca34f804ba90',
        apiKey: '$2a$10$m3ykh1NKxmtQDVM140H6TOTqsemkiBEdfdQnG/ApyhjJ1Duj2Ri6W',
        adminSettings: {
            shortlinkDailyLimit: 10,
            ptcAdDailyLimit: 15,
            minWithdrawAmount: 1000,
            airdropStatus: 'active'
        }
    },

    api: {
        baseUrl: 'https://api.jsonbin.io/v3/b',
        headers: {
            'Content-Type': 'application/json',
            'X-Master-Key': '$2a$10$m3ykh1NKxmtQDVM140H6TOTqsemkiBEdfdQnG/ApyhjJ1Duj2Ri6W',
            'X-Bin-Meta': false
        },

        async getAllData() {
            try {
                const response = await fetch(`${this.baseUrl}/${DATABASE.config.binId}/latest`, {
                    headers: this.headers
                });

                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const data = await response.json();
                return data.record || this.getDefaultData();
            } catch (error) {
                console.error('Data fetch error:', error);
                return this.getDefaultData();
            }
        },

        getDefaultData() {
            return {
                users: {},
                shortlinks: [],
                ptcAds: [],
                tasks: [],
                globalStats: {
                    totalUsers: 0,
                    totalBonk: 0
                },
                adminLogs: []
            };
        },

        async updateData(data) {
            try {
                const response = await fetch(`${this.baseUrl}/${DATABASE.config.binId}`, {
                    method: 'PUT',
                    headers: this.headers,
                    body: JSON.stringify(data)
                });

                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return await response.json();
            } catch (error) {
                console.error('Data update error:', error);
                return null;
            }
        }
    },

    admin: {
        async logAction(adminId, action, details) {
            try {
                const data = await DATABASE.api.getAllData();
                if (!data.adminLogs) data.adminLogs = [];

                data.adminLogs.push({
                    adminId,
                    action,
                    details,
                    timestamp: new Date().toISOString()
                });

                if (data.adminLogs.length > 1000) {
                    data.adminLogs = data.adminLogs.slice(-1000);
                }

                await DATABASE.api.updateData(data);
            } catch (error) {
                console.error('Admin log error:', error);
            }
        },

        async getAdminLogs(limit = 100) {
            try {
                const data = await DATABASE.api.getAllData();
                return (data.adminLogs || []).slice(-limit).reverse();
            } catch (error) {
                console.error('Admin logs fetch error:', error);
                return [];
            }
        },

        async updateSettings(settings) {
            try {
                const data = await DATABASE.api.getAllData();
                DATABASE.config.adminSettings = {
                    ...DATABASE.config.adminSettings,
                    ...settings
                };
                await DATABASE.api.updateData(data);
                return true;
            } catch (error) {
                console.error('Settings update error:', error);
                return false;
            }
        }
    },

    contentManagement: {
        // Enhanced Shortlink Management
        async addShortlink(adminId, shortlinkData) {
            try {
                const data = await DATABASE.api.getAllData();
                if (!data.shortlinks) data.shortlinks = [];

                const newShortlink = {
                    id: Date.now().toString(),
                    ...shortlinkData,
                    status: 'active',
                    createdAt: new Date().toISOString(),
                    createdBy: adminId,
                    stats: {
                        totalClicks: 0,
                        uniqueClicks: 0,
                        bonkPaid: 0
                    }
                };

                data.shortlinks.push(newShortlink);
                await DATABASE.api.updateData(data);
                await DATABASE.admin.logAction(adminId, 'shortlink_added', {
                    shortlinkId: newShortlink.id,
                    title: shortlinkData.title
                });

                return newShortlink;
            } catch (error) {
                console.error('Shortlink creation error:', error);
                return null;
            }
        },

        async updateShortlink(adminId, shortlinkId, updates) {
            try {
                const data = await DATABASE.api.getAllData();
                const index = data.shortlinks.findIndex(s => s.id === shortlinkId);
                
                if (index === -1) throw new Error('Shortlink not found');

                data.shortlinks[index] = {
                    ...data.shortlinks[index],
                    ...updates,
                    lastUpdated: new Date().toISOString(),
                    lastUpdatedBy: adminId
                };

                await DATABASE.api.updateData(data);
                await DATABASE.admin.logAction(adminId, 'shortlink_updated', {
                    shortlinkId,
                    updates
                });

                return data.shortlinks[index];
            } catch (error) {
                console.error('Shortlink update error:', error);
                return null;
            }
        },

        // Enhanced PTC Ad Management
        async addPtcAd(adminId, adData) {
            try {
                const data = await DATABASE.api.getAllData();
                if (!data.ptcAds) data.ptcAds = [];

                const newAd = {
                    id: Date.now().toString(),
                    ...adData,
                    status: 'active',
                    createdAt: new Date().toISOString(),
                    createdBy: adminId,
                    stats: {
                        totalViews: 0,
                        uniqueViews: 0,
                        bonkPaid: 0
                    }
                };

                data.ptcAds.push(newAd);
                await DATABASE.api.updateData(data);
                await DATABASE.admin.logAction(adminId, 'ptc_ad_added', {
                    adId: newAd.id,
                    title: adData.title
                });

                return newAd;
            } catch (error) {
                console.error('PTC ad creation error:', error);
                return null;
            }
        },

        async updatePtcAd(adminId, adId, updates) {
            try {
                const data = await DATABASE.api.getAllData();
                const index = data.ptcAds.findIndex(a => a.id === adId);
                
                if (index === -1) throw new Error('PTC ad not found');

                data.ptcAds[index] = {
                    ...data.ptcAds[index],
                    ...updates,
                    lastUpdated: new Date().toISOString(),
                    lastUpdatedBy: adminId
                };

                await DATABASE.api.updateData(data);
                await DATABASE.admin.logAction(adminId, 'ptc_ad_updated', {
                    adId,
                    updates
                });

                return data.ptcAds[index];
            } catch (error) {
                console.error('PTC ad update error:', error);
                return null;
            }
        },

        // Enhanced Task Management
        async addTask(adminId, taskData) {
            try {
                const data = await DATABASE.api.getAllData();
                if (!data.tasks) data.tasks = [];

                const newTask = {
                    id: Date.now().toString(),
                    ...taskData,
                    status: 'active',
                    createdAt: new Date().toISOString(),
                    createdBy: adminId,
                    stats: {
                        totalCompletions: 0,
                        uniqueCompletions: 0,
                        bonkPaid: 0
                    }
                };

                data.tasks.push(newTask);
                await DATABASE.api.updateData(data);
                await DATABASE.admin.logAction(adminId, 'task_added', {
                    taskId: newTask.id,
                    title: taskData.title
                });

                return newTask;
            } catch (error) {
                console.error('Task creation error:', error);
                return null;
            }
        },

        async updateTask(adminId, taskId, updates) {
            try {
                const data = await DATABASE.api.getAllData();
                const index = data.tasks.findIndex(t => t.id === taskId);
                
                if (index === -1) throw new Error('Task not found');

                data.tasks[index] = {
                    ...data.tasks[index],
                    ...updates,
                    lastUpdated: new Date().toISOString(),
                    lastUpdatedBy: adminId
                };

                await DATABASE.api.updateData(data);
                await DATABASE.admin.logAction(adminId, 'task_updated', {
                    taskId,
                    updates
                });

                return data.tasks[index];
            } catch (error) {
                console.error('Task update error:', error);
                return null;
            }
        },

        // Content Statistics
        async getContentStats() {
            try {
                const data = await DATABASE.api.getAllData();
                return {
                    shortlinks: {
                        total: data.shortlinks?.length || 0,
                        active: data.shortlinks?.filter(s => s.status === 'active').length || 0,
                        totalClicks: data.shortlinks?.reduce((sum, s) => sum + (s.stats?.totalClicks || 0), 0) || 0,
                        totalBonkPaid: data.shortlinks?.reduce((sum, s) => sum + (s.stats?.bonkPaid || 0), 0) || 0
                    },
                    ptcAds: {
                        total: data.ptcAds?.length || 0,
                        active: data.ptcAds?.filter(a => a.status === 'active').length || 0,
                        totalViews: data.ptcAds?.reduce((sum, a) => sum + (a.stats?.totalViews || 0), 0) || 0,
                        totalBonkPaid: data.ptcAds?.reduce((sum, a) => sum + (a.stats?.bonkPaid || 0), 0) || 0
                    },
                    tasks: {
                        total: data.tasks?.length || 0,
                        active: data.tasks?.filter(t => t.status === 'active').length || 0,
                        totalCompletions: data.tasks?.reduce((sum, t) => sum + (t.stats?.totalCompletions || 0), 0) || 0,
                        totalBonkPaid: data.tasks?.reduce((sum, t) => sum + (t.stats?.bonkPaid || 0), 0) || 0
                    }
                };
            } catch (error) {
                console.error('Content stats fetch error:', error);
                return null;
            }
        }
    },

    // Original methods remain unchanged
    users: { /* ... */ },
    earnings: { /* ... */ },
    ads: { /* ... */ },
    links: { /* ... */ },
    games: { /* ... */ },
    stats: { /* ... */ },
    analytics: { /* ... */ },
    security: { /* ... */ },
    errorTracking: { /* ... */ }
};

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DATABASE;
}
