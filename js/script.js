document.getElementById('fileInput').addEventListener('change', function() {
    const file = this.files[0];
    if (file) {
        showLoadingPopup();
        uploadFile(file);
    }
});

function showLoadingPopup() {
    const loadingPopup = document.getElementById('loadingPopup');
    const overlay = document.getElementById('overlay');
    loadingPopup.style.display = 'flex';
    overlay.style.display = 'block';
    loadingPopup.style.animation = 'fadeIn 0.5s';
}

function hideLoadingPopup() {
    const loadingPopup = document.getElementById('loadingPopup');
    const overlay = document.getElementById('overlay');
    loadingPopup.style.animation = 'fadeOut 0.5s';
    setTimeout(() => {
        loadingPopup.style.display = 'none';
        overlay.style.display = 'none';
    }, 500);
}

function showResultPopup(country) {
    const resultPopup = document.getElementById('resultPopup');
    const resultTitle = document.getElementById('resultTitle');
    const resultImage = document.getElementById('resultImage');
    const overlay = document.getElementById('overlay');
    const selectedDex = document.getElementById('dexSelector').value;

    resultTitle.textContent = `${country}`;
    const folder = selectedDex === 'Dynastydex' ? 'ballsDD' : 'balls';
    resultImage.src = `assets/${folder}/${country}.png`;

    resultPopup.style.display = 'block';
    overlay.style.display = 'block';
    resultPopup.style.animation = 'fadeIn 0.5s';
}

document.getElementById('closeResultPopup').addEventListener('click', hideResultPopup);

function hideResultPopup() {
    const resultPopup = document.getElementById('resultPopup');
    const resultImage = document.getElementById('resultImage');
    const overlay = document.getElementById('overlay');
    resultPopup.style.animation = 'fadeOut 0.5s';
    resultImage.src = '';
    setTimeout(() => {
        resultPopup.style.display = 'none';
        overlay.style.display = 'none';
    }, 500);
}

function uploadFile(file) {
    const reader = new FileReader();
    reader.onloadend = () => {
        const base64data = reader.result.split(',')[1];
        const selectedDex = document.getElementById('dexSelector').value;
        fetch('/.netlify/functions/compareImage', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ file: base64data, dex: selectedDex }),
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            console.log('Response data:', data);
            hideLoadingPopup();
            showResultPopup(data.country);
        })
        .catch(error => {
            console.error('Error:', error);
            hideLoadingPopup();
        });
    };
    reader.readAsDataURL(file);
}

document.addEventListener('paste', function(event) {
    const items = event.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            const file = items[i].getAsFile();
            if (file) {
                showLoadingPopup();
                uploadFile(file);
            }
        }
    }
});

document.getElementById('dexSelector').addEventListener('change', function() {
    const selectedDex = this.value;
    updateLogo(selectedDex);
});

function updateLogo(dex) {
    const logo = document.querySelector('.logo');
    if (dex === 'Ballsdex') {
        logo.src = 'assets/logo.png';
    } else if (dex === 'Dynastydex') {
        logo.src = 'assets/logoDD.png';
    }
}