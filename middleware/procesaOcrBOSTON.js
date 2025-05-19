var sequelize = require("../models/sequelizeConnection");
var imp_sku = require("../models/imp_sku");
var imp_importacion_archivo = require("../models/imp_importacion_archivo");
var imp_importacion = require("../models/imp_importacion");
var { valCantidad, valCodigo, valFecha, valValor } = require("./validaciones");
const { text } = require("express");

const procesaOcrBOSTON = async (ocr, ocrPL, nroDespacho) => {
  let dataImportacion = await imp_importacion.findOne({
    where: { nroDespacho: nroDespacho },
  });
  if (dataImportacion.tipoTranporte.toUpperCase() == "TERRESTRE") {
    return procesaOcrMaritimo(ocr, ocrPL, nroDespacho, "T");
  }
  if (dataImportacion.tipoTranporte.toUpperCase() == "MARITIMO") {
    return procesaOcrMaritimo(ocr, ocrPL, nroDespacho, "M");
  }
  if (dataImportacion.tipoTranporte.toUpperCase() == "AEREA") {
    return procesaOcrMaritimo(ocr, ocrPL, nroDespacho, "A");
  }
};

const procesaOcrMaritimo = async (ocr, ocrPL, nroDespacho, tipo) => {
  let data = [];
  let dataPacking = [];

  //Procesa FACTURA COMERCIAL

  let paginasFactura = [];
  for (let [i, e] of ocr.ParsedResults.entries()) {
    let texto = e.ParsedText.toUpperCase();
    if (texto.includes("INVOICE #:")) {
      paginasFactura.push(i);
    }
  }

  for (let [j, pagina] of paginasFactura.entries()) {
    let tabla = ocr.ParsedResults[pagina].ParsedText.split("\n");
    let tablaPL = ocrPL.ParsedResults[pagina].ParsedText.split("\n");

    for (let [i, e] of tabla.entries()) {
      let texto = e.toUpperCase();
      if (
        texto.includes("PRODUCT") &&
        texto.includes("DESCRIPTION") &&
        texto.includes("SHIPPED")
      ) {
        let indInicio = i + 1;
        for (let k = indInicio; k < indInicio + 100; k++) {
          if (k >= tabla.length - 2) {
            break;
          }

          let lineaMas0 = tabla[k].split("\t");
          if (lineaMas0.includes("TOTALS:")) {
            break;
          }
          const campos = lineaMas0.filter((item) => !item.includes("\r"));

          if (campos.length >= 5) {
            let item = {
              cantidad: campos[2].split(" ")[0].replace(/,/g, ""),
              codigo: campos[0].slice(0, 10),
              descripcion: campos[0].slice(30),
              valor: campos[5].split(" ")[0].replace(/,/g, ""),
              peso: campos[3].split(" ")[0].replace(/,/g, ""),

              codigoInvalido: false,
              cantidadInvalida: false,
              valorInvalido: false,
            };

            item.codigoInvalido = await valCodigo(item.codigo);
            item.cantidadInvalida = await valCantidad(item.cantidad);
            item.valorInvalido = await valValor(item.valor);

            data.push(item);
          }
        }
      }
    }
  }

  //Procesa PACKING LIST
  let paginasPackingList = [];
  for (let [i, e] of ocr.ParsedResults.entries()) {
    let texto = e.ParsedText.toUpperCase();
    if (texto.includes("FSIS") && texto.includes("LETTERHEAD")) {
      paginasPackingList.push(i);
    }
  }

  for (let [j, pagina] of paginasPackingList.entries()) {
    let tabla = ocr.ParsedResults[pagina].ParsedText.split("\n");
    let textoPagina = ocr.ParsedResults[pagina].ParsedText.toUpperCase();
    let tablaPL = ocrPL.ParsedResults[pagina].ParsedText.split("\n");

    for (let [i, e] of tabla.entries()) {
      let texto = e.toUpperCase();
      if (texto.includes("PRODUCTO") && texto.includes("FECHA DE FAENA")) {
        let indInicio = i + 1;
        for (let k = indInicio; k < indInicio + 100; k++) {
          if (k >= tabla.length - 2) {
            break;
          }

          let lineaMas0 = tabla[k].split("\t");
          const campos0 = lineaMas0.filter((item) => !item.includes("\r"));

          let lineaMas1 = tabla[k + 1].split("\t");
          const campos1 = lineaMas1.filter((item) => !item.includes("\r"));
          if (campos1.length >= 5) {
            let fechaProduccion = "";
            let fecha = campos1[1].match(/\d{2}\/\d{2}\/\d{4}/);
            if (fecha) {
              fechaProduccion = fecha[0];
              let f = fechaProduccion.split("/");
              fechaProduccion = `${f[2]}/${f[0]}/${f[1]}`;
              if (textoPagina.includes("FROZEN")) {
                let fechaObj = new Date(fechaProduccion);
                fechaObj.setDate(fechaObj.getDate() + 730);
                // Formatear la fecha al formato yyyy/mm/dd
                let nuevaFecha =
                  `${fechaObj.getFullYear()}/` +
                  `${String(fechaObj.getMonth() + 1).padStart(2, "0")}/` +
                  `${String(fechaObj.getDate()).padStart(2, "0")}`;
                fechaProduccion = nuevaFecha;
              } else {
                let fechaObj = new Date(fechaProduccion);
                fechaObj.setDate(fechaObj.getDate() + 90);
                // Formatear la fecha al formato yyyy/mm/dd
                let nuevaFecha =
                  `${fechaObj.getFullYear()}/` +
                  `${String(fechaObj.getMonth() + 1).padStart(2, "0")}/` +
                  `${String(fechaObj.getDate()).padStart(2, "0")}`;
                fechaProduccion = nuevaFecha;
              }
            }
            let vencimiento = fechaProduccion;

            let itemPL = {
              descripcion: "NA",
              fechaProduccion: "",
              sif: "1",
              fechaVencimiento: vencimiento,
              CajasPallet: "1",
              PesoNeto: "1",
              PesoBruto: "1",
              vencimientoInvalido: await valFecha(vencimiento),
              pesonetoInvalido: await valValor("1"),
              pesobrutoInvalido: await valValor("1"),
            };
            dataPacking.push(itemPL);
          }
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
  let vencimiento = await calculaVencimiento(fechasVencimiento, diasDuracion);
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
  let vencimiento = await calculaVencimiento(fechasVencimiento, -1);
  return vencimiento;
};

const calculaVencimiento = async (fechas, diasDuracion) => {
  // Convertir las fechas a objetos Date
  const fechasDate = fechas.map((fecha) => {
    const [mes, dia, anio] = fecha.split("/");
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

module.exports = procesaOcrBOSTON;
