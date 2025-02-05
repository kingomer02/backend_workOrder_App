import { PDFDocument, rgb } from 'pdf-lib';
import fs from 'fs';

export async function extractAndMergePDFs(existingPDFPath, generatedPDFPath, outputPDFPath, startAndEnd) {
    const existPDFBytes = fs.readFileSync(existingPDFPath);
    const genPDFBytes = fs.readFileSync(generatedPDFPath);
    
    const mergedPDF = await PDFDocument.create();

    const existPDF = await PDFDocument.load(existPDFBytes);
    const genPDF = await PDFDocument.load(genPDFBytes);

    const { start, end } = startAndEnd;
    console.log(`Start: ${start}, End: ${end}`);

    let tillStartArr = Array.from({ length: start - 1 }, (_, index) => index);
    let fromEndArr = Array.from({ length: existPDF.getPageCount() - end }, (_, index) => end + index);

    const existPDFPagesStart = await mergedPDF.copyPages(existPDF, tillStartArr);
    const existPDFPagesEnd = await mergedPDF.copyPages(existPDF, fromEndArr);
    
    console.log(tillStartArr, fromEndArr);
    existPDFPagesStart.forEach(page => mergedPDF.addPage(page));

    const genPDFPages = await mergedPDF.copyPages(genPDF, genPDF.getPageIndices());
    genPDFPages.forEach(page => mergedPDF.addPage(page));

    existPDFPagesEnd.forEach(page => mergedPDF.addPage(page));

    const totalPages = mergedPDF.getPageCount();
    mergedPDF.getPages().forEach((page, i) => {
        const { width, height } = page.getSize();

        page.drawRectangle({
            x: width / 2 - 60,
            y: 15,
            width: 120,
            height: 20,
            color: rgb(1, 1, 1),
            opacity: 1,
        });

        page.drawText(`Seite ${i + 1} / ${totalPages}`, {
            x: width / 2 - 30,
            y: 20,
            size: 12,
            color: rgb(0, 0, 0),
        });
    });

    const mergedPDFBytes = await mergedPDF.save();
    fs.writeFileSync(outputPDFPath, mergedPDFBytes);

    console.log("PDF wurde erfolgreich zusammengeführt und bearbeitet!");

}