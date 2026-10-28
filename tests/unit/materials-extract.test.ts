import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { extractDocument, extractHtmlText, extractMarkdownText } from '@academic/materials'

function deckZip(entries: Record<string, string>): Uint8Array {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0
  for (const [name, value] of Object.entries(entries)) {
    const nameBytes = Buffer.from(name, 'utf8')
    const data = Buffer.from(value, 'utf8')
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(0, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(0, 28)
    localParts.push(local, nameBytes, data)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    central.writeUInt32LE(0, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    centralParts.push(central, nameBytes)
    offset += local.length + nameBytes.length + data.length
  }
  const centralBytes = Buffer.concat(centralParts)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(Object.keys(entries).length, 8)
  eocd.writeUInt16LE(Object.keys(entries).length, 10)
  eocd.writeUInt32LE(centralBytes.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)
  return Buffer.concat([...localParts, centralBytes, eocd])
}

function minimalPdf(content: string, options: { compressed?: boolean; unicode?: boolean } = {}): Uint8Array {
  const streamBytes = Buffer.from(
    options.unicode ? content : content,
    options.compressed ? 'latin1' : 'latin1',
  )
  const data = options.compressed ? deflateSync(streamBytes) : streamBytes
  const stream = data.toString('latin1')
  const filter = options.compressed ? '/Filter /FlateDecode ' : ''
  const fontRef = options.unicode ? '6 0 R' : '4 0 R'
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 ${fontRef} >> >> /Contents 5 0 R >>\nendobj\n`,
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${data.length} ${filter}>>\nstream\n${stream}\nendstream\nendobj\n`,
    `6 0 obj\n<< /Type /Font /Subtype /Type0 /BaseFont /Test /ToUnicode 7 0 R >>\nendobj\n`,
    '7 0 obj\n<< /Length 400 >>\nstream\n' +
      [
        '/CIDInit /ProcSet findresource begin',
        '12 dict begin',
        'begincmap',
        '1 begincodespacerange',
        '<0000> <FFFF>',
        'endcodespacerange',
        '2 beginbfchar',
        '<0001> <5EFA>',
        '<0002> <7ACB>',
        'endbfchar',
        'endcmap',
        'end',
        'end',
        'endstream',
      ].join('\n') +
      '\nendobj\n',
  ]
  return Buffer.from(`%PDF-1.4\n${objects.join('')}trailer\n<< /Root 1 0 R >>\n%%EOF\n`, 'latin1')
}

describe('material text extraction', () => {
  it('extracts markdown headings and blocks', () => {
    const blocks = extractMarkdownText('# 第二章\n\n组合逻辑电路由门电路组成。\n\n## 练习\n\n### 题 1\n设计半加器。')
    expect(blocks.map((block) => block.text)).toContain('组合逻辑电路由门电路组成。')
    expect(blocks.find((block) => block.text === '设计半加器。')?.heading).toBe('题 1')
  })

  it('extracts HTML text and keeps headings', () => {
    const { blocks, title } = extractHtmlText(
      '<html><head><title>课程讲义</title><style>.x{}</style></head><body><h2>组合逻辑</h2><p>用与非门实现半加器。</p><script>alert(1)</script></body></html>',
    )
    expect(title).toBe('课程讲义')
    const text = blocks.map((block) => block.text).join('\n')
    expect(text).toContain('用与非门实现半加器。')
    expect(text).not.toContain('alert')
    expect(blocks.find((block) => block.text.includes('半加器'))?.heading).toBe('组合逻辑')
  })

  it('extracts plain PDF text with page numbers', () => {
    const pdf = minimalPdf('BT /F1 12 Tf 72 720 Td (Combinational logic design) Tj ET')
    const document = extractDocument('pdf', pdf)
    expect(document.pageCount).toBe(1)
    expect(document.blocks[0]?.text).toContain('Combinational logic design')
    expect(document.blocks[0]?.page).toBe(1)
  })

  it('extracts compressed PDF text', () => {
    const pdf = minimalPdf('BT /F1 12 Tf 72 720 Td (Flate compressed lecture note) Tj ET', {
      compressed: true,
    })
    const document = extractDocument('pdf', pdf)
    expect(document.blocks.map((block) => block.text).join(' ')).toContain(
      'Flate compressed lecture note',
    )
  })

  it('uses ToUnicode mappings for CJK PDF text', () => {
    const pdf = minimalPdf('BT /F1 12 Tf 72 720 Td <00010002> Tj ET', { unicode: true })
    const document = extractDocument('pdf', pdf)
    expect(document.blocks.map((block) => block.text).join(' ')).toContain('建立')
  })

  it('extracts DOCX paragraphs and headings', () => {
    const docx = deckZip({
      'word/document.xml':
        '<w:document><w:body>' +
        '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>实验一</w:t></w:r></w:p>' +
        '<w:p><w:r><w:t>测量与非门延迟。</w:t></w:r></w:p>' +
        '</w:body></w:document>',
    })
    const document = extractDocument('docx', docx)
    expect(document.blocks.map((block) => block.text).join('\n')).toContain('测量与非门延迟。')
    expect(document.blocks.find((block) => block.text.includes('测量'))?.heading).toBe('实验一')
  })

  it('extracts PPTX slides with slide numbers', () => {
    const pptx = deckZip({
      'ppt/slides/slide1.xml':
        '<p:sld><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>第一页</a:t></a:r></a:p><a:p><a:r><a:t>组合逻辑</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>',
      'ppt/slides/slide2.xml':
        '<p:sld><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>第二页</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>',
    })
    const document = extractDocument('pptx', pptx)
    expect(document.pageCount).toBe(2)
    expect(document.blocks[0]).toMatchObject({ page: 1 })
    expect(document.blocks[0]?.text).toContain('组合逻辑')
    expect(document.blocks[1]).toMatchObject({ page: 2 })
  })
})
