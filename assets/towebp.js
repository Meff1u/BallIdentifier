const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Ścieżka do katalogu głównego
const inputFolder = path.join(__dirname, 'bd-previous-arts');

// Funkcja do przetwarzania obrazów w folderach
const processImages = async (folderPath) => {
    try {
        const files = fs.readdirSync(folderPath);

        for (const file of files) {
            const filePath = path.join(folderPath, file);

            // Sprawdzanie, czy to folder
            if (fs.statSync(filePath).isDirectory()) {
                await processImages(filePath); // Rekurencyjne przetwarzanie podfolderów
            } else if (/\.(png|jpg|jpeg)$/i.test(file)) {
                console.log(`Przetwarzanie: ${filePath}`);

                const outputFilePath = filePath.replace(/\.(png|jpg|jpeg)$/i, '.webp');

                await sharp(filePath)
                    .resize({ width: 200 }) // Zmiana szerokości na 200px, zachowanie proporcji
                    .toFormat('webp') // Konwersja do formatu webp
                    .toFile(outputFilePath);

                console.log(`Zapisano: ${outputFilePath}`);

                // Usunięcie oryginalnego pliku
                fs.unlinkSync(filePath);
                console.log(`Usunięto: ${filePath}`);
            }
        }
    } catch (error) {
        console.error('Wystąpił błąd podczas przetwarzania obrazów:', error);
    }
};

// Uruchomienie funkcji dla katalogu głównego
processImages(inputFolder).then(() => {
    console.log('Przetwarzanie zakończone.');
});