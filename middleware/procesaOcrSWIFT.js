var sequelize = require("../models/sequelizeConnection");
var imp_sku = require("../models/imp_sku");
var imp_importacion_archivo = require("../models/imp_importacion_archivo");
var imp_importacion = require("../models/imp_importacion");
var { valCantidad, valCodigo, valFecha, valValor } = require("./validaciones");

const procesaOcrSWIFT = async (ocr, ocrPL, nroDespacho) => {
  let dataImportacion = await imp_importacion.findOne({
    where: { nroDespacho: nroDespacho },
  });
  if (dataImportacion.tipoTranporte.toUpperCase() == "TERRESTRE") {
    return procesaOcrSWIFTTerrestre(ocr, ocrPL, nroDespacho, "T");
  }
  if (dataImportacion.tipoTranporte.toUpperCase() == "MARITIMO") {
    return procesaOcrSWIFTAereo(ocr, ocrPL, nroDespacho, "M");
  }
  if (dataImportacion.tipoTranporte.toUpperCase() == "AEREA") {
    return procesaOcrSWIFTAereo(ocr, ocrPL, nroDespacho, "A");
  }
};

const procesaOcrSWIFTAereo = async (ocr, ocrPL, nroDespacho, tipo) => {
  let data = [];
  let dataPacking = [];
  let fechaVencimiento = "";
  if (tipo === "A") {
    fechaVencimiento = await procesaFechasVencimiento(ocr, ocrPL, nroDespacho);
  }

  if (tipo === "M") {
    fechaVencimiento = await procesaFechasVencimientoMaritimo(
      ocr,
      ocrPL,
      nroDespacho
    );
  }

  //Procesa FACTURA COMERCIAL

  let paginasFactura = [];
  for (let [i, e] of ocr.ParsedResults.entries()) {
    let texto = e.ParsedText.toUpperCase();
    if (texto.includes("INVOICE")) {
      paginasFactura.push(i);
    }
  }

  for (let [j, pagina] of paginasFactura.entries()) {
    let tabla = ocr.ParsedResults[pagina].ParsedText.split("\n");
    let tablaPL = ocrPL.ParsedResults[pagina].ParsedText.split("\n");

    for (let [i, e] of tabla.entries()) {
      let texto = e.toUpperCase();
      if (
        texto.includes("PRODUCT") ||
        (texto.includes("DESCRIPTION") && texto.includes("WEIGHT"))
      ) {
        let indInicio = i + 1;
        for (let k = indInicio; k < indInicio + 100; k++) {
          if (k >= tabla.length - 2) {
            break;
          }

          let lineaMas0 = tabla[k].split("\t");
          if (lineaMas0.includes(" PALLETS")) {
            break;
          }
          let lineaMas1 = tabla[k + 1].split("\t");
          let lineaMas2 = tabla[k + 2].split("\t");

          let codigo = lineaMas0[0];
          let codigoInvalido = await valCodigo(codigo);

          if (!codigoInvalido) {
            const linea = lineaMas0.concat(lineaMas1, lineaMas2);
            const limpio = linea.filter((item) => !item.includes("\r"));

            const campos = await entreCodigos(limpio);

            let item = {
              cantidad: campos[2],
              codigo: campos[0],
              descripcion: campos[campos.length - 1],
              valor: campos[5],
              peso: campos[1],

              codigoInvalido: false,
              cantidadInvalida: false,
              valorInvalido: false,
            };

            item.codigoInvalido = await valCodigo(item.codigo);
            item.cantidadInvalida = await valCantidad(item.cantidad);
            item.valorInvalido = await valValor(item.valor);

            let pesoInvalido = await valCantidad(item.peso);
            if (!pesoInvalido) {
              item.peso = parseFloat(item.peso) * 0.45359237;
              item.peso = item.peso.toFixed(2);
            }
            data.push(item);

            let itemPL = {
              descripcion: item.descripcion,
              fechaProduccion: "",
              sif: "1",
              fechaVencimiento: fechaVencimiento,
              CajasPallet: item.cantidad,
              PesoNeto: item.peso,
              PesoBruto: item.peso,
              vencimientoInvalido: false,
              pesonetoInvalido: false,
              pesobrutoInvalido: false,
            };
            dataPacking.push(itemPL);
          }
        }
      }
    }

    try {
      await imp_importacion_archivo.update(
        {
          detalles: JSON.stringify(data),
          packingList: JSON.stringify(dataPacking),
        },
        { where: { nroDespacho: nroDespacho } }
      );
    } catch (error) {
      console.log(error);
    }
  }
};

const procesaOcrSWIFTTerrestre = async (ocr, ocrPL, nroDespacho, tipo) => {
  let data = [];
  let dataPacking = [];
  let fechaVencimiento = "";
  if (tipo === "A") {
    fechaVencimiento = await procesaFechasVencimiento(ocr, ocrPL, nroDespacho);
  }

  if (tipo === "M") {
    fechaVencimiento = await procesaFechasVencimientoMaritimo(
      ocr,
      ocrPL,
      nroDespacho
    );
  }

  if (tipo === "T") {
    fechaVencimiento = await procesaFechasVencimientoTerrestre(
      ocr,
      ocrPL,
      nroDespacho
    );
  }

  //Procesa FACTURA COMERCIAL

  let paginasFactura = [];
  for (let [i, e] of ocr.ParsedResults.entries()) {
    let texto = e.ParsedText.toUpperCase();
    if (texto.includes("INVOICE")) {
      paginasFactura.push(i);
    }
  }

  for (let [j, pagina] of paginasFactura.entries()) {
    let tabla = ocr.ParsedResults[pagina].ParsedText.split("\n");
    let tablaPL = ocrPL.ParsedResults[pagina].ParsedText.split("\n");

    for (let [i, e] of tabla.entries()) {
      let texto = e.toUpperCase();
      if (
        texto.includes("PRODUCT") ||
        (texto.includes("DESCRIPTION") && texto.includes("WEIGHT"))
      ) {
        let indInicio = i + 1;
        for (let k = indInicio; k < indInicio + 100; k++) {
          if (k >= tabla.length - 2) {
            break;
          }

          let linea = tabla[k].toUpperCase();
          if (linea.includes("PRIOR") || linea.includes("ADJUST")) {
            break;
          }

          let lineaMas0 = tabla[k].split("\t");
          if (lineaMas0.includes(" PALLETS")) {
            break;
          }
          let lineaMas1 = tabla[k + 1].split("\t");
          let lineaMas2 = tabla[k + 2].split("\t");

          let codigo = lineaMas0[0];
          //let codigoInvalido = await valCodigo(codigo);

          if (lineaMas0.length >= 6) {
            const linea = lineaMas0.concat(lineaMas1, lineaMas2);
            const limpio = linea.filter((item) => !item.includes("\r"));

            //const campos = await entreCodigos(limpio);
            const campos = lineaMas0;

            let item = {
              cantidad: campos[2].replace(/,/g, ""),
              codigo: campos[0],
              descripcion: campos[1],
              valor: campos[campos.length - 2].replace(/,/g, ""),
              peso: campos[2].replace(/,/g, ""),

              codigoInvalido: false,
              cantidadInvalida: false,
              valorInvalido: false,
            };

            item.codigoInvalido = await valCodigo(item.codigo);
            item.cantidadInvalida = await valCantidad(item.cantidad);
            item.valorInvalido = await valValor(item.valor);

            let pesoInvalido = await valCantidad(item.peso);
            if (!pesoInvalido) {
              item.peso = parseFloat(item.peso) * 0.45359237;
              item.peso = item.peso.toFixed(2);
            }
            data.push(item);

            let itemPL = {
              descripcion: item.descripcion,
              fechaProduccion: "",
              sif: "1",
              fechaVencimiento: fechaVencimiento,
              CajasPallet: item.cantidad,
              PesoNeto: item.peso,
              PesoBruto: item.peso,
              vencimientoInvalido: false,
              pesonetoInvalido: false,
              pesobrutoInvalido: false,
            };
            dataPacking.push(itemPL);
          }
        }
      }
    }

    try {
      await imp_importacion_archivo.update(
        {
          detalles: JSON.stringify(data),
          packingList: JSON.stringify(dataPacking),
        },
        { where: { nroDespacho: nroDespacho } }
      );
    } catch (error) {
      console.log(error);
    }
  }
};

const procesaFechasVencimiento = async (ocr, ocrPL, nroDespacho) => {
  let fechasVencimiento = [];
  let paginasFactura = [];
  let diasDuracion = 0;
  for (let [i, e] of ocr.ParsedResults.entries()) {
    let texto = e.ParsedText.toUpperCase();
    if (texto.includes("FOOD SAFETY") && texto.includes("FSIS LETTERHEAD")) {
      paginasFactura.push(i);
      if (texto.includes("CHILLED")) {
        diasDuracion = 90;
      } else {
        diasDuracion = 270;
      }
    }
  }

  for (let [j, pagina] of paginasFactura.entries()) {
    let tabla = ocr.ParsedResults[pagina].ParsedText.split("\n");
    let tablaPL = ocrPL.ParsedResults[pagina].ParsedText.split("\n");

    for (let [i, e] of tabla.entries()) {
      let texto = e.toUpperCase();
      if (texto.includes("NAME OF PRODUCT") && texto.includes("UNITS")) {
        let indInicio = i;
        for (let k = indInicio; k < indInicio + 100; k++) {
          if (k >= tabla.length - 2) {
            break;
          }

          let linea = tabla[k].split(" ");
          let codigoInvalido = await valCodigo(linea[0]);
          if (!codigoInvalido) {
            let codigo = linea[0];
            let linea1 = tabla[k].split("\t");
            let linea2 = tabla[k + 1].split("\t");
            let linea3 = tabla[k + 2].split("\t");

            const todas = [...linea1, ...linea2, ...linea3];
            const regexFecha =
              /\b(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/\d{4}\b/g;

            todas.forEach((texto) => {
              const encontrados = texto.match(regexFecha);
              if (encontrados) {
                fechasVencimiento.push(...encontrados);
              }
            });
          }
        }
      }
    }
  }
  let vencimiento = await calculaVencimiento2(fechasVencimiento, diasDuracion);
  return vencimiento;
};

const procesaFechasVencimientoMaritimo = async (ocr, ocrPL, nroDespacho) => {
  let fechasVencimiento = [];
  let paginasFactura = [];
  let diasDuracion = 0;
  for (let [i, e] of ocr.ParsedResults.entries()) {
    let texto = e.ParsedText.toUpperCase();
    if (texto.includes("SLAUGHTER DATE") && texto.includes("CERTIFICATE")) {
      paginasFactura.push(i);
      if (texto.includes("CHILLED")) {
        diasDuracion = 90;
      } else {
        diasDuracion = 270;
      }
    }
  }

  for (let [j, pagina] of paginasFactura.entries()) {
    let tabla = ocr.ParsedResults[pagina].ParsedText.split("\n");
    let tablaPL = ocrPL.ParsedResults[pagina].ParsedText.split("\n");

    for (let [i, e] of tabla.entries()) {
      let texto = e.toUpperCase();
      if (texto.includes("CARTONS:") && texto.includes("SLAUGHTER")) {
        let indInicio = i + 1;
        for (let k = indInicio; k < indInicio + 100; k++) {
          if (k >= tabla.length - 2) {
            break;
          }

          let linea = tabla[k].split("\t");
          fechasVencimiento.push(linea[linea.length - 5]);
        }
      }
    }
  }
  let vencimiento = await calculaVencimiento2(fechasVencimiento, -1);
  return vencimiento;
};

const procesaFechasVencimientoTerrestre = async (ocr, ocrPL, nroDespacho) => {
  let fechasVencimiento = [];
  let paginasFactura = [];
  let diasDuracion = 0;
  for (let [i, e] of ocr.ParsedResults.entries()) {
    let texto = e.ParsedText.toUpperCase();
    if (
      texto.includes("CERTIFICADO") &&
      texto.includes("SANITARIO") &&
      texto.includes("PARA") &&
      texto.includes("CHILE")
    ) {
      paginasFactura.push(i);
      if (texto.includes("CHILLED")) {
        diasDuracion = 90;
      } else {
        diasDuracion = 270;
      }
    }
  }

  for (let [j, pagina] of paginasFactura.entries()) {
    let tabla = ocr.ParsedResults[pagina].ParsedText.split("\n");
    let tablaPL = ocrPL.ParsedResults[pagina].ParsedText.split("\n");

    for (let [i, e] of tabla.entries()) {
      let texto = e.toUpperCase();
      const regexFecha = /\b(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])-\d{4}\b/g;

      const encontrados = texto.match(regexFecha);
      if (encontrados) {
        fechasVencimiento.push(...encontrados);
      }
    }
  }
  let vencimiento = await calculaVencimiento(fechasVencimiento, diasDuracion);
  return vencimiento;
};

const calculaVencimiento = async (fechas, diasDuracion) => {
  // Convertir las fechas a objetos Date
  const fechasDate = fechas.map((fecha) => {
    const [mes, dia, anio] = fecha.split("-");
    return new Date(`${anio}-${mes}-${dia}`);
  });

  // Encontrar la menor fecha
  const menorFecha = new Date(Math.min(...fechasDate));

  // Sumar 90 días
  const fechaMas90 = new Date(menorFecha);
  fechaMas90.setDate(fechaMas90.getDate() + diasDuracion + 1);

  // Formatear fechas al formato mm/dd/yyyy
  const formatear = (fecha) =>
    `${fecha.getFullYear()}/` +
    `${String(fecha.getMonth() + 1).padStart(2, "0")}/` +
    `${String(fecha.getDate()).padStart(2, "0")}`;

  return formatear(fechaMas90);
};

const calculaVencimiento2 = async (fechas, diasDuracion) => {
  // Convertir las fechas a objetos Date
  const fechasDate = fechas.map((fecha) => {
    const [mes, dia, anio] = fecha.split("/");
    const d = new Date(`${anio}-${mes}-${dia}`);
    if (d.toString() != "Invalid Date") {
      return new Date(`${anio}-${mes}-${dia}`);
    }
  });

  // Filtrar fechas válidas
  const fechasValidas = fechasDate.filter((fecha) => fecha instanceof Date);

  // Encontrar la menor fecha
  const menorFecha = new Date(Math.min(...fechasValidas));

  // Sumar 90 días
  const fechaMas90 = new Date(menorFecha);
  fechaMas90.setDate(fechaMas90.getDate() + diasDuracion + 1);

  // Formatear fechas al formato mm/dd/yyyy
  const formatear = (fecha) =>
    `${fecha.getFullYear()}/` +
    `${String(fecha.getMonth() + 1).padStart(2, "0")}/` +
    `${String(fecha.getDate()).padStart(2, "0")}`;

  return formatear(fechaMas90);
};

const entreCodigos = async (linea) => {
  let arr = [];
  for (let [indice, e] of linea.entries()) {
    if (indice > 0) {
      let codInvalido = await valCodigo(e);
      if (!codInvalido) {
        break;
      }
    }
    arr.push(e);
  }

  const limpio = arr.map((item) => item.replace(/,/g, ""));
  const soloNumeros = limpio.filter(
    (x) => !isNaN(Number(x)) && x !== "" && x !== null
  );

  let existe = await imp_sku.findOne({
    where: { sku: soloNumeros[0] },
  });
  if (existe) {
    soloNumeros.push(existe.producto);
  } else {
    soloNumeros.push("");
  }

  return soloNumeros;
};

module.exports = procesaOcrSWIFT;
