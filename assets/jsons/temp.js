const fs = require('fs');
const path = require('path');

// Ścieżka do pliku JSON
const filePath = path.join(__dirname, 'Ballsdex.json');

// Wczytaj plik JSON
fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
        console.error('Błąd podczas odczytu pliku:', err);
        return;
    }

    try {
        // Parsowanie JSON
        const jsonData = JSON.parse(data);

        // Iteracja przez wpisy i modyfikacja rarity
        for (const key in jsonData) {
            if (jsonData[key].rarity >= 112) {
                jsonData[key].rarity += 1;
            }
        }

        // Zapis zmodyfikowanego JSON do pliku
        fs.writeFile(filePath, JSON.stringify(jsonData, null, 4), 'utf8', (err) => {
            if (err) {
                console.error('Błąd podczas zapisu pliku:', err);
            } else {
                console.log('Plik został pomyślnie zaktualizowany.');
            }
        });
    } catch (parseError) {
        console.error('Błąd podczas parsowania JSON:', parseError);
    }
});