<script>
// --- ONLINE LATU COIN SYSTEM ---
const CoinSystem = {
    // Get current coins
    getCoins: function() {
        return parseInt(localStorage.getItem('latu_coins')) || 0;
    },
    
    // Add coins (e.g., for playtime or achievements)
    addCoins: function(amount) {
        let current = this.getCoins();
        localStorage.setItem('latu_coins', current + amount);
        this.updateDisplay();
    },
    
    // Spend coins (returns true if successful, false if not enough)
    spendCoins: function(amount) {
        let current = this.getCoins();
        if (current >= amount) {
            localStorage.setItem('latu_coins', current - amount);
            this.updateDisplay();
            return true;
        }
        return false;
    },

    // Update the coin counter in the UI
    updateDisplay: function() {
        const display = document.getElementById('coin-balance');
        if (display) {
            display.textContent = this.getCoins();
        }
    },

    // Inventory Management
    getInventory: function() {
        return JSON.parse(localStorage.getItem('latu_inventory')) || [];
    },
    
    addItemToInventory: function(itemId) {
        let inv = this.getInventory();
        if (!inv.includes(itemId)) {
            inv.push(itemId);
            localStorage.setItem('latu_inventory', JSON.stringify(inv));
        }
    },

    getEquipped: function(category) {
        return localStorage.getItem('latu_equipped_' + category) || 'default';
    },

    equipItem: function(category, itemId) {
        localStorage.setItem('latu_equipped_' + category, itemId);
        this.applyTheme();
    },

    // Apply saved theme to the current page
    applyTheme: function() {
        const bg = this.getEquipped('background');
        const body = document.body;
        body.classList.remove('bg-default', 'bg-cyber', 'bg-ocean');
        
        if (bg === 'cyber') body.classList.add('bg-cyber');
        else if (bg === 'ocean') body.classList.add('bg-ocean');
        else body.classList.add('bg-default');
    }
};

// Playtime Tracker: Awards 1 coin every 60 seconds of active play
let playtimeSeconds = 0;
setInterval(() => {
    playtimeSeconds++;
    if (playtimeSeconds % 60 === 0) {
        CoinSystem.addCoins(1);
        // Optional: Show a subtle toast notification
        console.log("+1 Munt voor speeltijd!"); 
    }
}, 1000);

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    CoinSystem.updateDisplay();
    CoinSystem.applyTheme();
});
</script>

<style>
/* Theme Backgrounds */
.bg-default { background-color: #0f0f13; color: #ffffff; }
.bg-cyber { background: linear-gradient(135deg, #1a0b2e 0%, #4a148c 100%); color: #ffffff; }
.bg-ocean { background: linear-gradient(135deg, #001f3f 0%, #0074D9 100%); color: #ffffff; }

/* Coin Display Styling */
#coin-display {
    position: fixed;
    top: 20px;
    right: 20px;
    background: rgba(255, 215, 0, 0.15);
    border: 1px solid #ffd700;
    color: #ffd700;
    padding: 8px 16px;
    border-radius: 20px;
    font-weight: bold;
    font-family: monospace;
    font-size: 1.1em;
    z-index: 1000;
    box-shadow: 0 0 10px rgba(255, 215, 0, 0.3);
}
</style>
