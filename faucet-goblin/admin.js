// admin.js
document.addEventListener('DOMContentLoaded', () => {
    // Admin paneli başlatma
    initAdminPanel();
});

function initAdminPanel() {
    // İstatistikleri güncelle
    updateStats();
    // PTC reklamları listele
    loadPTCAds();
    // Shortlinkleri listele
    loadShortlinks();
}

function updateStats() {
    const stats = Database.stats.getDailyStats();
    const users = JSON.parse(localStorage.getItem('db_users'));
    const ptcAds = JSON.parse(localStorage.getItem('db_ptcAds'));
    
    document.getElementById('totalUsers').textContent = users.length;
    document.getElementById('dailyClaims').textContent = stats.totalClaims;
    document.getElementById('totalPayouts').textContent = stats.totalAmount.toFixed(8);
    document.getElementById('activeAds').textContent = ptcAds.filter(ad => ad.active).length;
}

// PTC Reklam işlemleri
function handlePTCSubmit(event) {
    event.preventDefault();
    const form = event.target;
    
    const adData = {
        title: form.querySelector('[name="title"]').value,
        url: form.querySelector('[name="url"]').value,
        duration: parseInt(form.querySelector('[name="duration"]').value),
        reward: parseFloat(form.querySelector('[name="reward"]').value)
    };
    
    Database.ptcAds.create(adData);
    loadPTCAds();
    form.reset();
}

function loadPTCAds() {
    const ptcTable = document.getElementById('ptcTable');
    const ads = Database.ptcAds.getActive();
    
    ptcTable.innerHTML = ads.map(ad => `
        <tr>
            <td>${ad.title}</td>
            <td>${ad.url}</td>
            <td>${ad.duration}s</td>
            <td>${ad.reward}</td>
            <td>${ad.views}</td>
            <td>
                <button onclick="togglePTCAd('${ad.id}')" class="btn">
                    ${ad.active ? 'Deaktif Et' : 'Aktif Et'}
                </button>
            </td>
        </tr>
    `).join('');
}

function togglePTCAd(adId) {
    const ads = JSON.parse(localStorage.getItem('db_ptcAds'));
    const adIndex = ads.findIndex(ad => ad.id === adId);
    if (adIndex !== -1) {
        ads[adIndex].active = !ads[adIndex].active;
        localStorage.setItem('db_ptcAds', JSON.stringify(ads));
        loadPTCAds();
    }
}

// Shortlink işlemleri
function handleShortlinkSubmit(event) {
    event.preventDefault();
    const form = event.target;
    
    const linkData = {
        title: form.querySelector('[name="title"]').value,
        targetUrl: form.querySelector('[name="targetUrl"]').value,
        reward: parseFloat(form.querySelector('[name="reward"]').value)
    };
    
    Database.shortlinks.create(linkData);
    loadShortlinks();
    form.reset();
}

function loadShortlinks() {
    const shortlinkTable = document.getElementById('shortlinkTable');
    const links = Database.shortlinks.getActive();
    
    shortlinkTable.innerHTML = links.map(link => `
        <tr>
            <td>${link.title}</td>
            <td>${link.targetUrl}</td>
            <td>${link.reward}</td>
            <td>${link.clicks}</td>
            <td>
                <button onclick="toggleShortlink('${link.id}')" class="btn">
                    ${link.active ? 'Deaktif Et' : 'Aktif Et'}
                </button>
            </td>
        </tr>
    `).join('');
}

function toggleShortlink(linkId) {
    const links = JSON.parse(localStorage.getItem('db_shortlinks'));
    const linkIndex = links.findIndex(link => link.id === linkId);
    if (linkIndex !== -1) {
        links[linkIndex].active = !links[linkIndex].active;
        localStorage.setItem('db_shortlinks', JSON.stringify(links));
        loadShortlinks();
    }
}

// Referans sistemi işlemleri
function loadReferrals() {
    const users = JSON.parse(localStorage.getItem('db_users'));
    const referralStats = users.reduce((stats, user) => {
        if (user.referredBy) {
            if (!stats[user.referredBy]) {
                stats[user.referredBy] = {
                    count: 0,
                    earnings: 0
                };
            }
            stats[user.referredBy].count++;
            stats[user.referredBy].earnings += user.totalEarned * 0.3; // 30% referral komisyonu
        }
        return stats;
    }, {});
    
    const referralTable = document.getElementById('referralTable');
    referralTable.innerHTML = Object.entries(referralStats).map(([email, stats]) => `
        <tr>
            <td>${email}</td>
            <td>${stats.count}</td>
            <td>${stats.earnings.toFixed(8)}</td>
        </tr>
    `).join('');
}

// Periyodik güncelleme
setInterval(updateStats, 60000); // Her dakika güncelle