class PrayerTimeApp {
    constructor() {
        this.states = [];
        this.zones = [];
        this.allZones = [];
        this.currentZone = null;
        this.prayerTimes = null;
        this.nextPrayerTimeout = null;
        this.nextPrayerMinutes = null;
        this.mainTimer = null;
        
        this.initializeElements();
        this.bindEvents();
        this.loadStates();
        this.loadSavedLocation();
        this.startClock();
    }

    initializeElements() {
        this.stateSelect = document.getElementById('state-select');
        this.zoneSelect = document.getElementById('zone-select');
        this.currentLocationText = document.getElementById('current-location-text');
        this.currentTimeElement = document.getElementById('current-time');
        this.currentDateElement = document.getElementById('current-date');
        this.nextPrayerName = document.getElementById('next-prayer-name');
        this.nextPrayerCountdown = document.getElementById('next-prayer-countdown');
        this.loadingElement = document.getElementById('loading');
        this.errorElement = document.getElementById('error');
        this.errorMessage = document.getElementById('error-message');
        this.retryBtn = document.getElementById('retry-btn');

        this.prayerTimeElements = {
            fajr: document.getElementById('fajr-time'),
            dhuhr: document.getElementById('dhuhr-time'),
            asr: document.getElementById('asr-time'),
            maghrib: document.getElementById('maghrib-time'),
            isha: document.getElementById('isha-time')
        };
    }

    bindEvents() {
        this.stateSelect.addEventListener('change', (e) => this.onStateChange(e.target.value));
        this.zoneSelect.addEventListener('change', (e) => {
            this.onZoneChange(e.target.value);
            this.updateZoneDisplayText();
        });
        this.zoneSelect.addEventListener('focus', () => this.restoreZoneFullText());
        this.zoneSelect.addEventListener('blur', () => this.updateZoneDisplayText());
        this.zoneSelect.addEventListener('mousedown', () => this.restoreZoneFullText());
        this.retryBtn.addEventListener('click', () => this.retryLoadPrayerTimes());
    }

    async loadStates() {
        try {
            const response = await fetch('https://api.waktusolat.app/zones');
            const zones = await response.json();
            
            // Store all zones for filtering
            this.allZones = zones;
            
            const statesSet = new Set();
            zones.forEach(zone => statesSet.add(zone.negeri));
            
            this.states = Array.from(statesSet).sort();
            this.populateStateDropdown();
            
        } catch (error) {
            console.error('Error loading states:', error);
            this.showError('Failed to load states');
        }
    }

    populateStateDropdown() {
        this.stateSelect.innerHTML = '<option value="">Select State</option>';
        this.states.forEach(state => {
            const option = document.createElement('option');
            option.value = state;
            option.textContent = state;
            this.stateSelect.appendChild(option);
        });
    }

    async onStateChange(selectedState) {
        if (!selectedState) {
            this.zoneSelect.disabled = true;
            this.zoneSelect.innerHTML = '<option value="">Select Zone</option>';
            return;
        }

        try {
            // Filter zones from already loaded data instead of making API call
            this.zones = this.allZones
                .filter(zone => zone.negeri === selectedState)
                .sort((a, b) => a.jakimCode.localeCompare(b.jakimCode));
            
            this.populateZoneDropdown();
            this.zoneSelect.disabled = false;
            
        } catch (error) {
            console.error('Error loading zones:', error);
            this.showError('Failed to load zones for ' + selectedState);
        }
    }

    populateZoneDropdown() {
        this.zoneSelect.innerHTML = '<option value="">Select Zone</option>';
        this.zones.forEach(zone => {
            const option = document.createElement('option');
            option.value = zone.jakimCode;
            const fullText = `${zone.jakimCode} - ${zone.daerah}`;
            option.textContent = fullText;
            option.setAttribute('data-short-text', zone.jakimCode);
            option.setAttribute('data-full-text', fullText);
            this.zoneSelect.appendChild(option);
        });
    }

    updateZoneDisplayText() {
        const selectedOption = this.zoneSelect.options[this.zoneSelect.selectedIndex];
        if (selectedOption && selectedOption.value) {
            const shortText = selectedOption.getAttribute('data-short-text');
            if (shortText) {
                selectedOption.textContent = shortText;
            }
        }
    }

    restoreZoneFullText() {
        for (let i = 1; i < this.zoneSelect.options.length; i++) { // Start from 1 to skip "Select Zone"
            const option = this.zoneSelect.options[i];
            const fullText = option.getAttribute('data-full-text');
            if (fullText) {
                option.textContent = fullText;
            }
        }
    }

    async onZoneChange(selectedZone) {
        if (!selectedZone) {
            this.currentLocationText.textContent = 'Please select a location';
            this.clearPrayerTimes();
            return;
        }

        const zone = this.zones.find(z => z.jakimCode === selectedZone);
        if (zone) {
            this.currentZone = zone;
            this.currentLocationText.textContent = `${zone.negeri} - ${zone.jakimCode} (${zone.daerah})`;
            this.saveLocation(zone.negeri, selectedZone);
            await this.loadPrayerTimes(selectedZone);
        }
    }

    async loadPrayerTimes(zoneCode) {
        this.showLoading();
        this.hideError();

        try {
            const today = new Date();
            const year = today.getFullYear();
            const month = today.getMonth() + 1;
            
            const response = await fetch(`https://api.waktusolat.app/v2/solat/${zoneCode}?year=${year}&month=${month}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            this.prayerTimes = this.getTodaysPrayerTimes(data);
            this.displayPrayerTimes(this.prayerTimes);
            this.updateNextPrayer();
            this.hideLoading();
            
        } catch (error) {
            console.error('Error loading prayer times:', error);
            this.hideLoading();
            this.showError('Failed to load prayer times. Please try again.');
        }
    }

    getTodaysPrayerTimes(monthData) {
        const today = new Date();
        const todayDay = today.getDate();
        
        if (monthData && monthData.prayers && Array.isArray(monthData.prayers)) {
            const todayData = monthData.prayers.find(day => day.day === todayDay);
            if (todayData) {
                // Convert Unix timestamps to time strings
                return {
                    fajr: this.timestampToTime(todayData.fajr),
                    dhuhr: this.timestampToTime(todayData.dhuhr),
                    asr: this.timestampToTime(todayData.asr),
                    maghrib: this.timestampToTime(todayData.maghrib),
                    isha: this.timestampToTime(todayData.isha)
                };
            }
        }
        
        return null;
    }

    displayPrayerTimes(data) {
        if (data) {
            this.prayerTimeElements.fajr.textContent = this.formatTime(data.fajr);
            this.prayerTimeElements.dhuhr.textContent = this.formatTime(data.dhuhr);
            this.prayerTimeElements.asr.textContent = this.formatTime(data.asr);
            this.prayerTimeElements.maghrib.textContent = this.formatTime(data.maghrib);
            this.prayerTimeElements.isha.textContent = this.formatTime(data.isha);
        }
    }

    timestampToTime(timestamp) {
        if (!timestamp) return null;
        
        try {
            const date = new Date(timestamp * 1000);
            const hours = date.getHours();
            const minutes = date.getMinutes();
            return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        } catch (error) {
            return null;
        }
    }

    formatTime(timeString) {
        if (!timeString) return '--:--';
        
        try {
            const [hours, minutes] = timeString.split(':');
            const hour24 = parseInt(hours);
            const minute = parseInt(minutes);
            
            const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
            const ampm = hour24 >= 12 ? 'PM' : 'AM';
            
            return `${hour12}:${String(minute).padStart(2, '0')} ${ampm}`;
        } catch (error) {
            return timeString;
        }
    }

    updateNextPrayer() {
        if (!this.prayerTimes) return;

        const now = new Date();
        const prayers = [
            { name: 'Fajr', time: this.prayerTimes.fajr, element: 'fajr' },
            { name: 'Dhuhr', time: this.prayerTimes.dhuhr, element: 'dhuhr' },
            { name: 'Asr', time: this.prayerTimes.asr, element: 'asr' },
            { name: 'Maghrib', time: this.prayerTimes.maghrib, element: 'maghrib' },
            { name: 'Isha', time: this.prayerTimes.isha, element: 'isha' }
        ];

        // Clear previous active states
        document.querySelectorAll('.prayer-card').forEach(card => {
            card.classList.remove('active');
        });

        let nextPrayer = null;
        const nowMinutes = now.getHours() * 60 + now.getMinutes();

        for (const prayer of prayers) {
            const [hours, minutes] = prayer.time.split(':').map(Number);
            const prayerMinutes = hours * 60 + minutes;

            if (prayerMinutes > nowMinutes) {
                nextPrayer = { ...prayer, minutes: prayerMinutes };
                break;
            }
        }

        // If no prayer found for today, next prayer is Fajr tomorrow
        if (!nextPrayer) {
            const [hours, minutes] = prayers[0].time.split(':').map(Number);
            const fajrMinutes = hours * 60 + minutes;
            nextPrayer = {
                ...prayers[0],
                minutes: fajrMinutes + (24 * 60) // Add 24 hours worth of minutes
            };
        }

        // Highlight current prayer period
        this.highlightCurrentPrayer(prayers, nowMinutes);

        this.nextPrayerName.textContent = nextPrayer.name;
        this.startCountdown(nextPrayer.minutes);
    }

    highlightCurrentPrayer(prayers, nowMinutes) {
        let currentPrayerIndex = -1;

        for (let i = 0; i < prayers.length; i++) {
            const [hours, minutes] = prayers[i].time.split(':').map(Number);
            const prayerMinutes = hours * 60 + minutes;

            if (nowMinutes >= prayerMinutes) {
                currentPrayerIndex = i;
            } else {
                break;
            }
        }

        if (currentPrayerIndex >= 0) {
            const currentPrayer = prayers[currentPrayerIndex];
            const prayerCard = document.querySelector(`.prayer-card.${currentPrayer.element}`);
            if (prayerCard) {
                prayerCard.classList.add('active');
            }
        }
    }

    startCountdown(nextPrayerMinutes) {
        this.nextPrayerMinutes = nextPrayerMinutes;
        // The countdown will be updated by the unified timer
    }

    startClock() {
        if (this.mainTimer) {
            clearInterval(this.mainTimer);
        }

        const updateAll = () => {
            const now = new Date();
            
            // Update current time display
            const timeOptions = {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
                timeZone: 'Asia/Kuala_Lumpur'
            };
            
            const dateOptions = {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                timeZone: 'Asia/Kuala_Lumpur'
            };

            this.currentTimeElement.textContent = now.toLocaleTimeString('en-US', timeOptions);
            this.currentDateElement.textContent = now.toLocaleDateString('en-US', dateOptions);
            
            // Update countdown if we have prayer times
            if (this.nextPrayerMinutes !== null) {
                this.updateCountdownDisplay(now);
            }
        };

        updateAll();
        this.mainTimer = setInterval(updateAll, 1000);
    }

    updateCountdownDisplay(now) {
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const nowSeconds = now.getSeconds();
        
        // Calculate total seconds until next prayer
        let totalSecondsLeft = (this.nextPrayerMinutes - nowMinutes) * 60 - nowSeconds;
        
        // Handle next day case
        if (totalSecondsLeft <= 0) {
            totalSecondsLeft += 24 * 60 * 60; // Add 24 hours in seconds
        }
        
        if (totalSecondsLeft <= 1) {
            // Refresh prayer times and next prayer calculation
            this.updateNextPrayer();
            return;
        }

        const hours = Math.floor(totalSecondsLeft / 3600);
        const minutes = Math.floor((totalSecondsLeft % 3600) / 60);
        const seconds = totalSecondsLeft % 60;

        this.nextPrayerCountdown.textContent = 
            `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    clearPrayerTimes() {
        Object.values(this.prayerTimeElements).forEach(element => {
            element.textContent = '--:--';
        });
        this.nextPrayerName.textContent = '--';
        this.nextPrayerCountdown.textContent = '--:--:--';
        this.nextPrayerMinutes = null;
        
        document.querySelectorAll('.prayer-card').forEach(card => {
            card.classList.remove('active');
        });

        if (this.nextPrayerTimeout) {
            clearTimeout(this.nextPrayerTimeout);
        }
    }

    saveLocation(state, zone) {
        localStorage.setItem('selectedState', state);
        localStorage.setItem('selectedZone', zone);
    }

    loadSavedLocation() {
        const savedState = localStorage.getItem('selectedState');
        const savedZone = localStorage.getItem('selectedZone');

        if (savedState && savedZone) {
            this.stateSelect.value = savedState;
            this.onStateChange(savedState).then(() => {
                if (this.zones.find(z => z.jakimCode === savedZone)) {
                    this.zoneSelect.value = savedZone;
                    this.onZoneChange(savedZone);
                }
            });
        }
    }

    showLoading() {
        this.loadingElement.classList.add('show');
    }

    hideLoading() {
        this.loadingElement.classList.remove('show');
    }

    showError(message) {
        this.errorMessage.textContent = message;
        this.errorElement.style.display = 'block';
    }

    hideError() {
        this.errorElement.style.display = 'none';
    }

    retryLoadPrayerTimes() {
        if (this.currentZone) {
            this.loadPrayerTimes(this.currentZone.jakimCode);
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PrayerTimeApp();
});