import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { PDFDocument, PageSizes } from 'pdf-lib';

export async function createPdfWithImages(imageDir, outputPdf) {
    const pageWidth = PageSizes.A4[1]; 
    const pageHeight = PageSizes.A4[0];

    const maxImagesPerPage = 6;
    const gridSize = [2, 3]; 
    const margin = 20; 
    const spacing = 10;

    const pdfDoc = await PDFDocument.create();
    
    const images = fs.readdirSync(imageDir)
        .filter(img => /\.(png|jpg|jpeg)$/i.test(img))
        .map(img => path.join(imageDir, img));

    for (let pageIndex = 0; pageIndex < images.length; pageIndex += maxImagesPerPage) {

        const currentImages = images.slice(pageIndex, pageIndex + maxImagesPerPage);

        const numImages = currentImages.length;
        const rows = Math.ceil(numImages / gridSize[1]);
        const cellWidth = (pageWidth - 2 * margin - (gridSize[1] - 1) * spacing) / gridSize[1];
        const cellHeight = (pageHeight - 2 * margin - (gridSize[0] - 1) * spacing) / gridSize[0];

        const page = pdfDoc.addPage([pageWidth, pageHeight]);

        for (let idx = 0; idx < currentImages.length; idx++) {
            const imgPath = currentImages[idx];
            const col = idx % gridSize[1];
            const row = Math.floor(idx / gridSize[1]); 

            const x = margin + col * (cellWidth + spacing);
            const y = pageHeight - margin - (row + 1) * cellHeight - row * spacing;

            const img = await sharp(imgPath).metadata();
            const scale = Math.min(cellWidth / img.width, cellHeight / img.height);
            const newWidth = img.width * scale;
            const newHeight = img.height * scale;

            const imageBytes = fs.readFileSync(imgPath);
            const image = await pdfDoc.embedJpg(imageBytes);
            page.drawImage(image, {
                x: x + (cellWidth - newWidth) / 2,
                y: y + (cellHeight - newHeight) / 2,
                width: newWidth,
                height: newHeight,
            });
        }
    }

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPdf, pdfBytes);
    console.log(`PDF created: ${outputPdf}`);
}



