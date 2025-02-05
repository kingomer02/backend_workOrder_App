import fs from 'fs';
import 'pdfjs-dist/legacy/build/pdf.mjs';

async function extractImagesFromPDF(pdfPath) {
    let start = null;
    let end = null;
    const pdf = await pdfjsLib.getDocument(pdfPath).promise;

    for (let i = 2; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const operatorList = await page.getOperatorList();

        let foundImage = false;
        operatorList.fnArray.forEach((fn) => {
            if (fn === pdfjsLib.OPS.paintImageXObject || fn === pdfjsLib.OPS.paintJpegXObject) {
                foundImage = true;
            }
        });

        if (foundImage) {
            if (!start) {
                start = i;
                continue;
            }
            end = i-1;
            // console.log(`Seite ${i}: Bild gefunden!`);
        };
    }
  return { start, end };
}

export async function findStartEndPage(existingPdfPath) {
    const startAndEnd = await extractImagesFromPDF(existingPdfPath);
    return startAndEnd;
}