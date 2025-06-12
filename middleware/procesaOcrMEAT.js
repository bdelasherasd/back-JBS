var sequelize = require("../models/sequelizeConnection");
var imp_sku = require("../models/imp_sku");
var imp_importacion_archivo = require("../models/imp_importacion_archivo");
var imp_importacion = require("../models/imp_importacion");
var { valCantidad, valCodigo, valFecha, valValor } = require("./validaciones");
var getInvoiceNumber = require("./getInvoiceNumber");

const procesaOcrMEAT = async (ocr, ocrPL, nroDespacho) => {
  let dataImportacion = await imp_importacion.findOne({
    where: { nroDespacho: nroDespacho },
  });
  if (dataImportacion.tipoTranporte.toUpperCase() == "TERRESTRE") {
    return procesaOcrTerrestre(ocr, ocrPL, nroDespacho, "T");
  }
};

const procesaOcrTerrestre = async (ocr, ocrPL, nroDespacho, tipo) => {
  //Procesa FACTURA COMERCIAL

  let paginasFactura = [];
  for (let [i, e] of ocr.ParsedResults.entries()) {
    let texto = e.ParsedText.toUpperCase();
    if (texto.includes("COMMERCIAL INVOICE")) {
      paginasFactura.push(i);
    }
  }
  let dataFactura = await procesaFactura(paginasFactura, ocr, ocrPL);

  let paginasPackingList = [];
  for (let [i, e] of ocr.ParsedResults.entries()) {
    let texto = e.ParsedText.toUpperCase();
    if (texto.includes("PACKING LIST") || texto.includes("PRODUCTION DATES")) {
      paginasPackingList.push(i);
    }
  }
  let dataPacking = await procesaPackingList(paginasPackingList, ocr, ocrPL);

  try {
    await imp_importacion_archivo.update(
      {
        detalles: JSON.stringify(dataFactura),
        packingList: JSON.stringify(dataPacking),
      },
      { where: { nroDespacho: nroDespacho } }
    );
  } catch (error) {
    console.log(error);
  }
};

const procesaFactura = async (paginasFactura, ocr, ocrPL) => {
  let data = [];
  for (let [j, pagina] of paginasFactura.entries()) {
    let tabla = ocr.ParsedResults[pagina].ParsedText.split("\n");
    let tablaPL = ocrPL.ParsedResults[pagina].ParsedText.split("\n");

    for (let [i, e] of tabla.entries()) {
      let texto = e.toUpperCase();
      if (
        texto.includes("DESCRIPTION") &&
        texto.includes("PLT") &&
        texto.includes("CASE")
      ) {
        let indInicio = i + 1;
        for (let k = indInicio; k < indInicio + 100; k++) {
          if (k >= tabla.length - 1) {
            break;
          }

          let lineaMas0 = tabla[k].replace().split("\t");
          let campos0 = lineaMas0.filter((item) => !item.includes("\r"));

          let campoInvalido = await valCodigo(campos0[0]);

          if (!campoInvalido) {
            let lineaMas1 = tabla[k + 1].replace().split("\t");
            let campos1 = lineaMas1.filter((item) => !item.includes("\r"));
            let lineaMas2 = tabla[k + 2].replace().split("\t");
            let campos2 = lineaMas2.filter((item) => !item.includes("\r"));
            let lineaMas3 = tabla[k + 3].replace().split("\t");
            let campos3 = lineaMas3.filter((item) => !item.includes("\r"));
            let lineaMas4 = tabla[k + 4].replace().split("\t");
            let campos4 = lineaMas4.filter((item) => !item.includes("\r"));

            let codigo = campos0[0];
            let cantidad = campos0[2].split(".")[0];
            let valor = campos4[2].replace(/,/g, "");
            let peso = campos3[1].replace(/,/g, "");
            let item = {
              cantidad: cantidad,
              codigo: codigo,
              descripcion: "",
              valor: valor,
              peso: peso,
              codigoInvalido: false,
              cantidadInvalida: false,
              valorInvalido: false,
              invoiceNumber: await getInvoiceNumber(nroDespacho),
            };

            item.codigoInvalido = await valCodigo(item.codigo);
            item.cantidadInvalida = await valCantidad(item.cantidad);
            item.valorInvalido = await valValor(item.valor);

            let pesoInvalido = await valCantidad(item.peso);
            if (pesoInvalido) {
              item.peso = "0";
            }

            data.push(item);
          }
        }
      }
    }
  }
  return data;
};

const procesaPackingList = async (paginasPackingList, ocr, ocrPL) => {
  let dataPacking = [];
  let codigos = [];
  for (let [j, pagina] of paginasPackingList.entries()) {
    let tabla = ocr.ParsedResults[pagina].ParsedText.split("\n");
    let tablaPL = ocrPL.ParsedResults[pagina].ParsedText.split("\n");

    for (let [i, e] of tabla.entries()) {
      let texto = e.toUpperCase();

      if (
        texto.includes("GOODS") &&
        texto.includes("SIF") &&
        texto.includes("DATE")
      ) {
        let indInicio = i + 1;
        let fechas = [];
        for (let k = indInicio; k < tabla.length; k++) {
          let lineaMas0 = tabla[k].replace().split("\t");
          if (tabla[k].toUpperCase().includes("OBS:")) {
            break;
          }
          let campos0 = lineaMas0.filter((item) => !item.includes("\r"));
          let lineaMas1 = tabla[k + 1].replace().split("\t");
          let campos1 = lineaMas1.filter((item) => !item.includes("\r"));

          let t = campos1.join(" ");
          let f = t.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
          if (f) {
            fechas.push(f[0]);
          }
        }

        if (fechas.length > 0) {
          let fechaMenor = fechas.reduce((min, curr) => {
            let [d, m, y] = curr.split("/");
            let date = new Date(y.length === 2 ? "20" + y : y, m - 1, d);
            return !min || date < min ? date : min;
          }, null);

          let fechaMenorStr = "";
          let fechaSumadaStr = "";
          if (fechaMenor) {
            let dd = String(fechaMenor.getDate()).padStart(2, "0");
            let mm = String(fechaMenor.getMonth() + 1).padStart(2, "0");
            let yyyy = fechaMenor.getFullYear();
            fechaMenorStr = `${yyyy}/${mm}/${dd}`;
            let fechaSumada = new Date(fechaMenor);

            fechaSumada.setDate(fechaSumada.getDate() + 540);
            let ddSumada = String(fechaSumada.getDate()).padStart(2, "0");
            let mmSumada = String(fechaSumada.getMonth() + 1).padStart(2, "0");
            let yyyySumada = fechaSumada.getFullYear();
            fechaSumadaStr = `${yyyySumada}/${mmSumada}/${ddSumada}`;
          }
          let itemPL = {
            descripcion: "NA",
            fechaProduccion: "",
            sif: "1",
            fechaVencimiento: fechaSumadaStr,
            CajasPallet: "1",
            PesoNeto: "1",
            PesoBruto: "1",
            vencimientoInvalido: await valFecha(fechaMenorStr),
            pesonetoInvalido: await valValor("1"),
            pesobrutoInvalido: await valValor("1"),
          };
          dataPacking.push(itemPL);
        }
      }
    }
  }

  return dataPacking;
};

const getPeso = async (tabla) => {
  let peso = "";
  for (let [i, e] of tabla.entries()) {
    let texto = e.toUpperCase();
    if (texto.includes("PESO NETO") || texto.includes("NET WEIGHT")) {
      let lineaMas0 = texto.replace().split("\t");

      let campos = lineaMas0.filter((item) => !item.includes("\r"));
      peso = campos[campos.length - 1].replace(/,/g, "");
    }
  }
  return peso;
};

const getVencimiento = async (tabla) => {
  let fecha = "";
  for (let [i, e] of tabla.entries()) {
    let texto = e.toUpperCase();
    if (texto.includes("EXPIRA")) {
      let lineaMas0 = texto.replace().split("\t");

      let campos = lineaMas0.filter((item) => !item.includes("\r"));
      fecha = campos[campos.length - 1].replace(/,/g, "");

      let df = fecha.split("/");
      fecha =
        df[2] + "/" + df[1].padStart(2, "0") + "/" + df[0].padStart(2, "0");
    }
  }
  return fecha;
};

function limpiarTexto2(texto) {
  let sinPuntos = texto.replace(/\./g, "");
  let sinComas = sinPuntos.replace(/,/g, ".");
  return sinComas;
}

function limpiarTexto(texto) {
  // Eliminar todas las comas
  let sinComas = texto.replace(/[^0-9.]/g, "");

  // Encontrar la última aparición de un punto
  const ultimaPosicionPunto = sinComas.lastIndexOf(".");

  if (ultimaPosicionPunto !== -1) {
    let sinPuntos = "";
    let arr = sinComas.split(".");
    // Recorrer el arreglo hacia atrás

    if (arr.length > 2) {
      for (let [i, e] of arr.entries()) {
        if (i == arr.length - 2) {
          sinPuntos = sinPuntos + e + ".";
        } else {
          sinPuntos = sinPuntos + e;
        }
      }
      sinComas = sinPuntos;
    }
  }

  return sinComas;
}

const buscaCodigoValido = async (arr) => {
  let existe = false;
  let posicion = 0;
  let descripcion = "";
  for ([i, e] of arr.entries()) {
    let codigo = e;
    if (codigo.length > 0) {
      let existeSku = await imp_sku.findOne({
        where: { sku: codigo },
      });
      if (existeSku) {
        posicion = i;
        existe = true;
        descripcion = existeSku.producto;
        break;
      }
    }
  }
  return { existe, posicion, descripcion };
};

module.exports = procesaOcrMEAT;
