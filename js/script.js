document.getElementById('fileInput').addEventListener('change', function() {
    const file = this.files[0];
    if (file) {
        showLoadingPopup();
        uploadFile(file);
    }
});

function showLoadingPopup() {
    const loadingPopup = document.getElementById('loadingPopup');
    loadingPopup.style.display = 'flex';
    loadingPopup.style.animation = 'fadeIn 0.5s';
}

function hideLoadingPopup() {
    const loadingPopup = document.getElementById('loadingPopup');
    loadingPopup.style.animation = 'fadeOut 0.5s';
    setTimeout(() => {
        loadingPopup.style.display = 'none';
    }, 500);
}

function showResultPopup(country) {
    const resultPopup = document.getElementById('resultPopup');
    const resultTitle = document.getElementById('resultTitle');
    const resultImage = document.getElementById('resultImage');

    resultTitle.textContent = `${country}`;
    resultImage.src = `assets/balls/${country}.png`;

    resultPopup.style.display = 'block';
    resultPopup.style.animation = 'fadeIn 0.5s';
}

document.getElementById('closeResultPopup').addEventListener('click', hideResultPopup);

function hideResultPopup() {
    const resultPopup = document.getElementById('resultPopup');
    resultPopup.style.animation = 'fadeOut 0.5s';
    setTimeout(() => {
        resultPopup.style.display = 'none';
    }, 500);
}

function uploadFile(file) {
    const reader = new FileReader();
    reader.onloadend = () => {
        const base64data = reader.result.split(',')[1];
        console.log('Base64 data:', base64data);
        fetch('/.netlify/functions/compareImage', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ file: base64data }),
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