import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { findStartEndPage } from './exctract-images-from-pdf.js';
import dotenv from 'dotenv';

dotenv.config();

async function callfindStartEndPage(existingPDFPath) {
  return await findStartEndPage(existingPDFPath);
}

export async function scrapeData(work_orders, socket, userDir) {
  const userName = process.env.USER_NAME;
  const password = process.env.PASSWORD;
  const loginPageUrl = process.env.PAGE_URL;
  const workOrderUrl = process.env.WORK_ORDER_URL;
 
  try {
    const downloadPath = path.resolve(path.join(userDir, "/old_pdfs"));

    const browser = await chromium.launch({
      headless: true,
    });

    const context = await browser.newContext({
      bypassCSP: true, // Umgeht Content-Security-Policies
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", // Falls nötig
      acceptDownloads: true,
      downloadsPath: downloadPath,
    });

    const page = await context.newPage();
    await page.goto(loginPageUrl);
    

    socket.emit('statusBackend', 'Navigated to page');

    // Login process
    await page.fill("#mat-input-0", userName);
    await page.fill("#mat-input-1", password);

    await page.click("#kt_login_signin_submit");
    await page.waitForTimeout(5000); // Wait for login to complete

    // Define the work order scraping function
    const run_work_orders = async (work_orders) => {
      let compatible = false;
      for (let i = 0; i < work_orders.length; i++) {
        compatible = true;
        const work_order = work_orders[i];

        socket.emit('statusBackend', `Navigating to work order: ${work_order}`);
        console.log(`Navigating to work order: ${work_order}`);

        await page.goto(
          `${workOrderUrl}/${work_order}`,
          {
            waitUntil: "networkidle",
          }
        );
        await page.waitForTimeout(5000); // Wait for page to load
        try {
          const xpath =
            '//*[@id="mat-tab-content-0-0"]/div/div/div[2]/table/tbody/tr[1]/td[1]';
          await page.waitForSelector(`xpath=${xpath}`, { visible: true });

          const textContent = await page.textContent(`xpath=${xpath}`);

          if (textContent.trim() === String(work_order)) {
            socket.emit('statusBackend', `Work order ${work_order} found and loaded`);
          } else {
            socket.emit('statusBackend', `Work order ${work_order} not found`);
            compatible = false;
            continue;
          }
        } catch (error) {
          socket.emit('statusBackend', `Work order ${work_order} not found`);
          console.log(`Work order ${work_order} not found`);
          compatible = false;
          continue;
        }

        // Create directories for work orders
        const dir = path.join(userDir, `work_orders/${work_order}`);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);

        const images_dir = `${dir}/images`;
        if (!fs.existsSync(images_dir)) fs.mkdirSync(images_dir);

        // Find images in the form
        const form_elements = await page.$$(
          'xpath=//*[@id="printable"]/kt-work-order-asset-comment/div[2]/div'
        );

        for (let form_element of form_elements) {
          const img_elements = await form_element.$$("img");
          if (img_elements.length === 0) {
            compatible = false;
            socket.emit('statusBackend', `Work order ${work_order} is not compatible`);
            break;
          }
          
          socket.emit('statusBackend', `Number of images found: ${img_elements.length} Downloading...`);

          for (let img_element of img_elements) {
            const img_url = await img_element.getAttribute("src");

            if (img_url) {
              const img_filename = path.basename(img_url);
              const img_path = `${images_dir}/${img_filename}`;

              if (!fs.existsSync(img_path)) {
                const response = await fetch(img_url);
                if (!response.ok) {
                  console.error(`Unexpected response ${response.statusText}`);
                  continue;
                }
                const buffer = await response.arrayBuffer();
                fs.writeFileSync(img_path, Buffer.from(buffer));
              }
            }
          }
        }

        if (!compatible) continue;

        await page.waitForSelector(
          'xpath=//*[@id="kt_content"]/div/ng-component/kt-work-order-update-procedure-form/kt-portlet/div/kt-portlet-header/div[2]/button',
          { visible: true }
        );
        await page.click(
          'xpath=//*[@id="kt_content"]/div/ng-component/kt-work-order-update-procedure-form/kt-portlet/div/kt-portlet-header/div[2]/button'
        );

        await page.waitForSelector(
          'xpath=//*[@id="mat-menu-panel-0"]/div/button[2]',
          { visible: true }
        );

        const downloadPromise = page.waitForEvent("download");
        await page.click('xpath=//*[@id="mat-menu-panel-0"]/div/button[2]');
        const download = await downloadPromise;
        console.log(download.suggestedFilename());

        // Download the PDF
        const file_name = download.suggestedFilename();
        const existingPDFPath = path.join(userDir, `old_pdfs/${file_name}`);
        await download.saveAs(existingPDFPath);
        console.log(`PDF downloaded: ${existingPDFPath}`);
        socket.emit('statusBackend', `PDF from Website downloaded.`);
        const startAndEnd = await callfindStartEndPage(existingPDFPath);

        // Create new PDF with images
        const generatedPDFPath = `${dir}/${work_order}.pdf`
        const { createPdfWithImages } = await import("./create-pdf-with-images.js");
        await createPdfWithImages(images_dir, generatedPDFPath);
        socket.emit('statusBackend', `new PDF with images created.`);

        const mergedFileName = file_name.replace(".pdf", "_merged.pdf");
        const outputPDF = path.join(userDir, `/pdfs/${mergedFileName}`);

        const { extractAndMergePDFs } = await import("./extract-and-merge-pdfs.js");
        await extractAndMergePDFs(existingPDFPath, generatedPDFPath, outputPDF, startAndEnd);
        socket.emit('statusBackend', `Work order completed!`);
        socket.emit('pdfs', fs.readdirSync(path.join(userDir, 'pdfs')));
        
        // Remove old PDFs and images
        fs.rmSync(path.join(userDir,'old_pdfs'), { recursive: true, force: true });
        fs.mkdirSync(path.join(userDir, '/old_pdfs'));

        fs.rmSync(path.join(userDir,`work_orders/${work_order}`), { recursive: true , force: true});
      
        compatible = true;
      }
      return compatible;
    };
    
    const runBackend = await run_work_orders(work_orders);
    await browser.close();
    if (!runBackend) {
      socket.emit('statusBackend', 'Work order not compatible!');
    }
    else{
      socket.emit('statusBackend', 'Successfully finished!');
    }
    } catch (error) {
    console.error("Error during scraping:", error);
  }
}
