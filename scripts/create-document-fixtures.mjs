import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {zipSync,strToU8} from 'fflate';
const directory='_research/temp/document-acceptance';mkdirSync(directory,{recursive:true});
writeFileSync(directory+'/owned-document.docx',zipSync({
 '[Content_Types].xml':strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
 '_rels/.rels':strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
 'word/document.xml':strToU8('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Owned Office document: blue square and verified original bytes.</w:t></w:r></w:p></w:body></w:document>')
}));
for(let index=0;index<8;index++)writeFileSync(`${directory}/owned-image-${index}.png`,readFileSync('src-tauri/icons/32x32.png'));
const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 400] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
const stream='BT /F1 12 Tf 20 350 Td (Owned native PDF worker verified) Tj ET';objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
let pdf='%PDF-1.4\n';const offsets=[];for(let index=0;index<objects.length;index++){offsets.push(pdf.length);pdf+=`${index+1} 0 obj\n${objects[index]}\nendobj\n`;}
const xref=pdf.length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.map(offset=>`${String(offset).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
writeFileSync(directory+'/owned-document.pdf',pdf);
console.log('Owned DOCX and eight image fixtures created.');
