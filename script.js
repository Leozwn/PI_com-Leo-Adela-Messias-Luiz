"use strict";

// EDITE AQUI: número com código do país + DDD, somente dígitos.
// Exemplo de formato: 55 + DDD + número. Vazio impede o redirecionamento.
const BOOKING_CONFIG = {
  whatsappNumber: "",
  timeZone: "America/Sao_Paulo",
  blockMinutes: 60,
  workingDays: [2, 3, 4, 5, 6], // Domingo = 0; segunda = 1.
  periods: [{ start: "09:00", end: "12:00" }, { start: "14:00", end: "17:00" }],
  services: [
    { id: "corte", name: "Corte Clássico", duration: 60, price: 40, icon: "scissors" },
    { id: "barba", name: "Barba Terapia", duration: 60, price: 30, icon: "razor" },
    { id: "combo", name: "Combo Cabelo + Barba", duration: 120, price: 65, icon: "sparkle" }
  ],
  demo: { enabled: true, occupiedTimes: ["10:00", "15:00"] },
  // Adicione ocupações manuais por data: "2026-10-01": ["09:00", "10:00"].
  // Cada entrada ocupa um bloco inteiro. Não há sincronização com uma agenda real.
  occupiedByDate: {}
};

function zonedNow(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: BOOKING_CONFIG.timeZone, year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(now).map(part => [part.type, part.value]));
  return { date: parts.year + "-" + parts.month + "-" + parts.day,
    minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + "T12:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

function dateError(value, now = new Date()) {
  const date = parseDate(value);
  if (!date) return "Selecione uma data válida.";
  if (value < zonedNow(now).date) return "Escolha hoje ou uma data futura.";
  if (!BOOKING_CONFIG.workingDays.includes(date.getUTCDay())) return "Não atendemos neste dia.";
  return "";
}

function firstFutureWorkingDay(now = new Date()) {
  const date = parseDate(zonedNow(now).date);
  for (let count = 0; count < 7; count += 1) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (BOOKING_CONFIG.workingDays.includes(date.getUTCDay())) return date.toISOString().slice(0, 10);
  }
  return "";
}

function demoOccupancy(now = new Date()) {
  const result = Object.fromEntries(Object.entries(BOOKING_CONFIG.occupiedByDate)
    .map(([date, times]) => [date, [...times]]));
  const demoDate = firstFutureWorkingDay(now);
  if (BOOKING_CONFIG.demo.enabled && demoDate) {
    result[demoDate] = [...(result[demoDate] || []), ...BOOKING_CONFIG.demo.occupiedTimes];
  }
  return result;
}

function toMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function toTime(minutes) {
  return String(Math.floor(minutes / 60)).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0");
}

function availability(date, service, now = new Date(), occupiedByDate = BOOKING_CONFIG.occupiedByDate) {
  const current = zonedNow(now);
  const invalidDate = dateError(date, now);
  const occupied = new Set(occupiedByDate[date] || []);
  const slots = [];
  for (const period of BOOKING_CONFIG.periods) {
    for (let start = toMinutes(period.start); start < toMinutes(period.end); start += BOOKING_CONFIG.blockMinutes) {
      const time = toTime(start);
      let reason = "";
      if (!date || !service) reason = "Escolha serviço e data";
      else if (invalidDate) reason = "Data indisponível";
      else if (date === current.date && start <= current.minutes) reason = "Horário encerrado";
      else if (occupied.has(time)) reason = "Ocupado";
      else if (start + service.duration > toMinutes(period.end)) reason = "Sem tempo suficiente";
      else {
        for (let offset = 0; offset < service.duration; offset += BOOKING_CONFIG.blockMinutes) {
          if (occupied.has(toTime(start + offset))) {
            reason = "Bloco seguinte ocupado";
            break;
          }
        }
      }
      slots.push({ time, available: !reason, reason });
    }
  }
  return slots;
}

function formatMoney(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(value) {
  return parseDate(value) ? value.split("-").reverse().join("/") : "";
}

function phoneDigits(value) {
  return value.replace(/\D/g, "").slice(0, 11);
}

function formatPhone(value) {
  const digits = phoneDigits(value);
  if (!digits) return "";
  if (digits.length <= 2) return "(" + digits;
  const local = digits.slice(2);
  const split = digits.length > 10 ? 5 : 4;
  return "(" + digits.slice(0, 2) + ") " + local.slice(0, split) +
    (local.length > split ? "-" + local.slice(split) : "");
}

function nameError(value) {
  const words = value.trim().split(/\s+/).filter(word => /\p{L}/u.test(word));
  return words.length >= 2 ? "" : "Informe seu nome e sobrenome.";
}

function phoneError(value) {
  const digits = value.replace(/\D/g, "");
  return /^[1-9]{2}\d{8,9}$/.test(digits) ? "" : "Informe um telefone com DDD e 10 ou 11 dígitos.";
}

function bookingMessage({ name, phone, service, date, time }) {
  return [
    "Olá, Leo Barbas! Gostaria de solicitar um agendamento:",
    "",
    "• Nome: " + name.trim().replace(/\s+/g, " "),
    "• WhatsApp: " + formatPhone(phone),
    "• Serviço: " + service.name,
    "• Duração: " + service.duration + " minutos",
    "• Data: " + formatDate(date),
    "• Horário: " + time,
    "• Valor total: " + formatMoney(service.price),
    "",
    "Aguardo a confirmação de disponibilidade da barbearia."
  ].join("\n");
}

function whatsappUrl(number, message) {
  if (!/^55[1-9]{2}\d{8,9}$/.test(number)) return "";
  return "https://wa.me/" + number + "?text=" + encodeURIComponent(message);
}

function initBooking() {
  const byId = id => document.getElementById(id);
  const form = byId("booking-form");
  const dateInput = byId("booking-date");
  const nameInput = byId("client-name");
  const phoneInput = byId("client-phone");
  const servicesContainer = byId("service-options");
  const timesContainer = byId("time-options");
  const status = byId("submit-status");
  const state = { serviceId: "", time: "" };
  // As ocupações de exemplo ficam estáveis enquanto esta página estiver aberta.
  const occupiedByDate = demoOccupancy();
  let slotsSignature = "";
  const selectedService = () => BOOKING_CONFIG.services.find(service => service.id === state.serviceId);

  const weekdays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const days = BOOKING_CONFIG.workingDays;
  const consecutive = days.every((day, index) => !index || day === days[index - 1] + 1);
  const daysText = consecutive && days.length > 1
    ? weekdays[days[0]] + " a " + weekdays[days[days.length - 1]].toLowerCase()
    : days.map(day => weekdays[day]).join(", ");
  const hoursText = BOOKING_CONFIG.periods.map(period =>
    period.start.replace(":00", "h") + "–" + period.end.replace(":00", "h")).join(" e ");
  byId("opening-hours").textContent = daysText + " · " + hoursText;
  byId("date-hint").textContent = "Horários de Brasília · Atendimento: " + daysText.toLowerCase() + ".";

  for (const service of BOOKING_CONFIG.services) {
    const label = document.createElement("label");
    label.className = "service-option";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "service";
    radio.value = service.id;
    radio.required = true;
    radio.setAttribute("aria-describedby", "service-error");
    const card = document.createElement("span");
    card.className = "service-card";
    card.innerHTML = '<svg class="service-icon" aria-hidden="true"><use/></svg><span class="radio-indicator" aria-hidden="true"></span><span class="service-name"></span><span class="service-duration"></span><span class="service-price"></span>';
    card.querySelector("use").setAttribute("href", "#" + service.icon);
    card.querySelector(".service-name").textContent = service.name;
    card.querySelector(".service-duration").textContent = service.duration + " minutos";
    card.querySelector(".service-price").textContent = formatMoney(service.price);
    label.append(radio, card);
    servicesContainer.append(label);
  }

  function setError(key, message) {
    byId(key + "-error").textContent = message;
    const targets = {
      date: [dateInput], name: [nameInput], phone: [phoneInput],
      service: [...servicesContainer.querySelectorAll("input")],
      time: [byId("time-fieldset")]
    };
    for (const target of targets[key]) target.setAttribute("aria-invalid", String(Boolean(message)));
  }

  function clearStatus() {
    status.hidden = true;
    status.textContent = "";
  }

  function updateSummary() {
    const service = selectedService();
    byId("summary-service").textContent = service ? service.name : "A escolher";
    byId("summary-duration").textContent = service ? service.duration + " minutos" : "—";
    byId("summary-date").textContent = dateInput.value && !dateError(dateInput.value)
      ? formatDate(dateInput.value) : "A escolher";
    byId("summary-time").textContent = state.time || "A escolher";
    byId("summary-total").textContent = service ? formatMoney(service.price) : "—";
  }

  function refreshSlots(now = new Date()) {
    dateInput.min = zonedNow(now).date;
    const service = selectedService();
    const slots = availability(dateInput.value, service, now, occupiedByDate);
    if (state.time && !slots.some(slot => slot.time === state.time && slot.available)) {
      state.time = "";
      setError("time", "O horário anterior não está disponível. Escolha outro horário.");
    }
    const error = dateInput.value ? dateError(dateInput.value, now) : "";
    if (error) setError("date", error);
    let hint = "Selecione um serviço e uma data para consultar.";
    if (service && dateInput.value) {
      if (error) hint = "Escolha outra data para consultar os horários.";
      else if (!slots.some(slot => slot.available)) hint = "Não há horários para este serviço nesta data. Experimente outro dia.";
      else if (service.duration > BOOKING_CONFIG.blockMinutes) hint = "Este serviço precisa de " + service.duration + " minutos livres, sem intervalos.";
      else hint = "Escolha um horário disponível para o seu atendimento.";
    }
    byId("schedule-status").textContent = hint;
    const signature = JSON.stringify([slots, state.time]);
    if (signature !== slotsSignature) {
      const focusedTime = document.activeElement?.dataset.time;
      timesContainer.replaceChildren();
      for (const slot of slots) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "time-slot";
        button.dataset.time = slot.time;
        button.dataset.status = slot.available ? "available" : "unavailable";
        button.disabled = !slot.available;
        button.setAttribute("aria-pressed", String(state.time === slot.time));
        const caption = slot.available ? (state.time === slot.time ? "Selecionado" : "Disponível") : slot.reason;
        button.setAttribute("aria-label", slot.time + " — " + caption);
        button.title = caption;
        const timeLabel = document.createElement("span");
        timeLabel.className = "slot-time";
        timeLabel.textContent = slot.time;
        const subtitle = document.createElement("small");
        subtitle.textContent = !dateInput.value || !service ? "Aguardando seleção" : caption;
        button.append(timeLabel, subtitle);
        timesContainer.append(button);
      }
      slotsSignature = signature;
      if (focusedTime) {
        const previous = [...timesContainer.children].find(button => button.dataset.time === focusedTime && !button.disabled);
        if (previous) previous.focus();
        else dateInput.focus();
      }
    }
    updateSummary();
  }

  servicesContainer.addEventListener("change", event => {
    if (event.target.name !== "service") return;
    state.serviceId = event.target.value;
    setError("service", "");
    clearStatus();
    refreshSlots();
  });

  dateInput.addEventListener("change", () => {
    setError("date", dateError(dateInput.value));
    clearStatus();
    refreshSlots();
  });

  timesContainer.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button || button.disabled) return;
    // Revalida inclusive se a página permaneceu aberta até o horário vencer.
    const slot = availability(dateInput.value, selectedService(), new Date(), occupiedByDate)
      .find(item => item.time === button.dataset.time);
    if (!slot?.available) {
      refreshSlots();
      return;
    }
    state.time = button.dataset.time;
    setError("time", "");
    clearStatus();
    refreshSlots();
  });

  nameInput.addEventListener("input", () => {
    if (nameInput.getAttribute("aria-invalid") === "true") setError("name", nameError(nameInput.value));
    clearStatus();
  });
  nameInput.addEventListener("blur", () => {
    if (nameInput.value) setError("name", nameError(nameInput.value));
  });

  function maskPhone() {
    const raw = phoneInput.value;
    const caret = phoneInput.selectionStart ?? raw.length;
    const digitsBeforeCaret = raw.slice(0, caret).replace(/\D/g, "").length;
    phoneInput.value = formatPhone(raw);
    let position = 0;
    let digitsSeen = 0;
    while (position < phoneInput.value.length && digitsSeen < digitsBeforeCaret) {
      if (/\d/.test(phoneInput.value[position])) digitsSeen += 1;
      position += 1;
    }
    if (caret === raw.length) position = phoneInput.value.length;
    phoneInput.setSelectionRange(position, position);
    if (phoneInput.getAttribute("aria-invalid") === "true") setError("phone", phoneError(phoneInput.value));
    clearStatus();
  }

  phoneInput.addEventListener("input", maskPhone);
  phoneInput.addEventListener("beforeinput", event => {
    const caret = phoneInput.selectionStart;
    if (event.inputType !== "deleteContentBackward" || !caret ||
        caret !== phoneInput.selectionEnd || /\d/.test(phoneInput.value[caret - 1])) return;
    event.preventDefault();
    let previousDigit = caret - 1;
    while (previousDigit >= 0 && !/\d/.test(phoneInput.value[previousDigit])) previousDigit -= 1;
    phoneInput.value = phoneInput.value.slice(0, Math.max(0, previousDigit)) + phoneInput.value.slice(caret);
    phoneInput.setSelectionRange(Math.max(0, previousDigit), Math.max(0, previousDigit));
    maskPhone();
  });
  phoneInput.addEventListener("blur", () => {
    if (phoneInput.value) setError("phone", phoneError(phoneInput.value));
  });

  form.addEventListener("submit", event => {
    event.preventDefault();
    clearStatus();
    const now = new Date();
    refreshSlots(now);
    const service = selectedService();
    const validTime = availability(dateInput.value, service, now, occupiedByDate)
      .some(slot => slot.available && slot.time === state.time);
    const errors = {
      service: service ? "" : "Escolha um serviço.",
      date: dateError(dateInput.value, now),
      time: validTime ? "" : "Selecione um horário disponível.",
      name: nameError(nameInput.value),
      phone: phoneError(phoneInput.value)
    };
    for (const [key, error] of Object.entries(errors)) setError(key, error);
    if (Object.values(errors).some(Boolean)) {
      if (errors.service) servicesContainer.querySelector("input").focus();
      else if (errors.date) dateInput.focus();
      else if (errors.time) timesContainer.querySelector("button:not(:disabled)")?.focus();
      else if (errors.name) nameInput.focus();
      else phoneInput.focus();
      // Se não houver horários livres, direcione a correção à data.
      if (!errors.service && !errors.date && errors.time && !timesContainer.querySelector("button:not(:disabled)")) dateInput.focus();
      return;
    }
    const message = bookingMessage({ name: nameInput.value, phone: phoneInput.value, service, date: dateInput.value, time: state.time });
    const url = whatsappUrl(BOOKING_CONFIG.whatsappNumber, message);
    if (!url) {
      status.textContent = "O WhatsApp da barbearia ainda não foi configurado. Para ativar o envio, preencha whatsappNumber no início de script.js com 55, DDD e número, somente dígitos. Nenhuma solicitação foi enviada.";
      status.hidden = false;
      status.focus();
      return;
    }
    window.location.assign(url);
  });

  refreshSlots();
  // Atualiza o limite de data e os horários vencidos sem perder seleções válidas.
  window.setInterval(() => { if (!document.hidden) refreshSlots(); }, 30000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshSlots(); });
}

// Permite verificar as regras com Node, sem dependências e sem carregar a interface.
if (typeof module !== "undefined" && module.exports) {
  module.exports = { BOOKING_CONFIG, zonedNow, parseDate, dateError, firstFutureWorkingDay,
    demoOccupancy, availability, formatMoney, formatDate, formatPhone, nameError,
    phoneError, bookingMessage, whatsappUrl };
}
if (typeof document !== "undefined") initBooking();
