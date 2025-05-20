import { clsx } from 'clsx'

export function Logo({ className, active }) {
    if( active){
        return (
<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 50 50" shape-rendering="geometricPrecision" className={className}>
  <circle cx="15.0" cy="5.0" r="1.0" fill="currentColor">
    <animate attributeName="r" dur="2.4s" repeatCount="indefinite" keyTimes="0.000;0.021;0.229;0.438;0.688;0.896;1.000" values="1.0;1.0;3.0;1.0;3.0;1.0;1.0"/>
  </circle>
  <circle cx="25.0" cy="5.0" r="1.0" fill="currentColor">
    <animate attributeName="r" dur="2.4s" repeatCount="indefinite" keyTimes="0.000;0.042;0.250;0.458;0.667;0.875;1.000" values="1.0;1.0;3.0;1.0;3.0;1.0;1.0"/>
  </circle>
  <circle cx="35.0" cy="5.0" r="1.0" fill="currentColor">
    <animate attributeName="r" dur="2.4s" repeatCount="indefinite" keyTimes="0.000;0.063;0.271;0.479;0.646;0.854;1.000" values="1.0;1.0;3.0;1.0;3.0;1.0;1.0"/>
  </circle>
  <circle cx="5.0" cy="15.0" r="1.0" fill="currentColor">
    <animate attributeName="r" dur="2.4s" repeatCount="indefinite" keyTimes="0.000;0.021;0.229;0.438;0.729;0.938;1.000" values="1.0;1.0;3.0;1.0;3.0;1.0;1.0"/>
  </circle>
  <circle cx="15.0" cy="15.0" r="1.0" fill="currentColor">
    <animate attributeName="r" dur="2.4s" repeatCount="indefinite" keyTimes="0.000;0.042;0.250;0.458;0.708;0.917;1.000" values="1.0;1.0;3.0;1.0;3.0;1.0;1.0"/>
  </circle>
  <circle cx="25.0" cy="15.0" r="1.0" fill="currentColor">
    <animate attributeName="r" dur="2.4s" repeatCount="indefinite" keyTimes="0.000;0.063;0.271;0.479;0.688;0.896;1.000" values="1.0;1.0;3.0;1.0;3.0;1.0;1.0"/>
  </circle>
  <circle cx="35.0" cy="15.0" r="1.0" fill="currentColor">
    <animate attributeName="r" dur="2.4s" repeatCount="indefinite" keyTimes="0.000;0.083;0.292;0.500;0.667;0.875;1.000" values="1.0;1.0;3.0;1.0;3.0;1.0;1.0"/>
  </circle>
  <circle cx="45.0" cy="15.0" r="1.0" fill="currentColor">
    <animate attributeName="r" dur="2.4s" repeatCount="indefinite" keyTimes="0.000;0.104;0.312;0.521;0.646;0.854;1.000" values="1.0;1.0;3.0;1.0;3.0;1.0;1.0"/>
  </circle>
  <circle cx="5.0" cy="25.0" r="1.0" fill="currentColor">
    <animate attributeName="r" dur="2.4s" repeatCount="indefinite" keyTimes="0.000;0.042;0.250;0.458;0.750;0.958;1.000" values="1.0;1.0;3.0;1.0;3.0;1.0;1.0"/>
  </circle>
  <circle cx="15.0" cy="25.0" r="1.0" fill="currentColor">
    <animate attributeName="r" dur="2.4s" repeatCount="indefinite" keyTimes="0.000;0.063;0.271;0.479;0.729;0.938;1.000" values="1.0;1.0;3.0;1.0;3.0;1.0;1.0"/>
  </circle>
  <circle cx="25.0" cy="25.0" r="1.0" fill="currentColor">
    <animate attributeName="r" dur="2.4s" repeatCount="indefinite" keyTimes="0.000;0.083;0.292;0.500;0.708;0.917;1.000" values="1.0;1.0;3.0;1.0;3.0;1.0;1.0"/>
  </circle>
  <circle cx="35.0" cy="25.0" r="1.0" fill="currentColor">
    <animate attributeName="r" dur="2.4s" repeatCount="indefinite" keyTimes="0.000;0.104;0.312;0.521;0.688;0.896;1.000" values="1.0;1.0;3.0;1.0;3.0;1.0;1.0"/>
  </circle>
  <circle cx="45.0" cy="25.0" r="1.0" fill="currentColor">
    <animate attributeName="r" dur="2.4s" repeatCount="indefinite" keyTimes="0.000;0.125;0.333;0.542;0.667;0.875;1.000" values="1.0;1.0;3.0;1.0;3.0;1.0;1.0"/>
  </circle>
  <circle cx="5.0" cy="35.0" r="1.0" fill="currentColor">
    <animate attributeName="r" dur="2.4s" repeatCount="indefinite" keyTimes="0.000;0.063;0.271;0.479;0.771;0.979;1.000" values="1.0;1.0;3.0;1.0;3.0;1.0;1.0"/>
  </circle>
  <circle cx="15.0" cy="35.0" r="1.0" fill="currentColor">
    <animate attributeName="r" dur="2.4s" repeatCount="indefinite" keyTimes="0.000;0.083;0.292;0.500;0.750;0.958;1.000" values="1.0;1.0;3.0;1.0;3.0;1.0;1.0"/>
  </circle>
  <circle cx="25.0" cy="35.0" r="1.0" fill="currentColor">
    <animate attributeName="r" dur="2.4s" repeatCount="indefinite" keyTimes="0.000;0.104;0.312;0.521;0.729;0.938;1.000" values="1.0;1.0;3.0;1.0;3.0;1.0;1.0"/>
  </circle>
  <circle cx="35.0" cy="35.0" r="1.0" fill="currentColor">
    <animate attributeName="r" dur="2.4s" repeatCount="indefinite" keyTimes="0.000;0.125;0.333;0.542;0.708;0.917;1.000" values="1.0;1.0;3.0;1.0;3.0;1.0;1.0"/>
  </circle>
  <circle cx="45.0" cy="35.0" r="1.0" fill="currentColor">
    <animate attributeName="r" dur="2.4s" repeatCount="indefinite" keyTimes="0.000;0.146;0.354;0.563;0.688;0.896;1.000" values="1.0;1.0;3.0;1.0;3.0;1.0;1.0"/>
  </circle>
  <circle cx="15.0" cy="45.0" r="1.0" fill="currentColor">
    <animate attributeName="r" dur="2.4s" repeatCount="indefinite" keyTimes="0.000;0.104;0.312;0.521;0.771;0.979;1.000" values="1.0;1.0;3.0;1.0;3.0;1.0;1.0"/>
  </circle>
  <circle cx="25.0" cy="45.0" r="1.0" fill="currentColor">
    <animate attributeName="r" dur="2.4s" repeatCount="indefinite" keyTimes="0.000;0.125;0.333;0.542;0.750;0.958;1.000" values="1.0;1.0;3.0;1.0;3.0;1.0;1.0"/>
  </circle>
  <circle cx="35.0" cy="45.0" r="1.0" fill="currentColor">
    <animate attributeName="r" dur="2.4s" repeatCount="indefinite" keyTimes="0.000;0.146;0.354;0.563;0.729;0.938;1.000" values="1.0;1.0;3.0;1.0;3.0;1.0;1.0"/>
  </circle>
</svg>
        )
    }
    return (
<svg xmlns="http://www.w3.org/2000/svg" width="186.67" height="186.67" viewBox="20 20 146.67 146.67" shape-rendering="geometricPrecision" className={className}>
              <circle cx="66" cy="40" r="3.00" fill="currentColor">
                    <animate attributeName="r" dur="2.00s" repeatCount="indefinite" keyTimes="0.000;0.250;0.625;1.000;1.000" values="3.00;3.00;5.00;3.00;3.00"/>
                </circle>
                <circle cx="93" cy="40" r="3.53" fill="currentColor">
                    <animate attributeName="r" dur="2.00s" repeatCount="indefinite" keyTimes="0.000;0.224;0.599;0.974;1.000" values="3.53;3.53;5.53;3.53;3.53"/>
                </circle>
                <circle cx="120" cy="40" r="3.00" fill="currentColor">
                    <animate attributeName="r" dur="2.00s" repeatCount="indefinite" keyTimes="0.000;0.250;0.625;1.000;1.000" values="3.00;3.00;5.00;3.00;3.00"/>
                </circle>
                <circle cx="40" cy="66" r="3.00" fill="currentColor">
                    <animate attributeName="r" dur="2.00s" repeatCount="indefinite" keyTimes="0.000;0.250;0.625;1.000;1.000" values="3.00;3.00;5.00;3.00;3.00"/>
                </circle>
                <circle cx="66" cy="66" r="4.84" fill="currentColor">
                    <animate attributeName="r" dur="2.00s" repeatCount="indefinite" keyTimes="0.000;0.158;0.533;0.908;1.000" values="4.84;4.84;6.84;4.84;4.84"/>
                </circle>
                <circle cx="93" cy="66" r="5.76" fill="currentColor">
                    <animate attributeName="r" dur="2.00s" repeatCount="indefinite" keyTimes="0.000;0.112;0.487;0.862;1.000" values="5.76;5.76;7.76;5.76;5.76"/>
                </circle>
                <circle cx="120" cy="66" r="4.84" fill="currentColor">
                    <animate attributeName="r" dur="2.00s" repeatCount="indefinite" keyTimes="0.000;0.158;0.533;0.908;1.000" values="4.84;4.84;6.84;4.84;4.84"/>
                </circle>
                <circle cx="146" cy="66" r="3.00" fill="currentColor">
                    <animate attributeName="r" dur="2.00s" repeatCount="indefinite" keyTimes="0.000;0.250;0.625;1.000;1.000" values="3.00;3.00;5.00;3.00;3.00"/>
                </circle>
                <circle cx="40" cy="93" r="3.53" fill="currentColor">
                    <animate attributeName="r" dur="2.00s" repeatCount="indefinite" keyTimes="0.000;0.224;0.599;0.974;1.000" values="3.53;3.53;5.53;3.53;3.53"/>
                </circle>
                <circle cx="66" cy="93" r="5.76" fill="currentColor">
                    <animate attributeName="r" dur="2.00s" repeatCount="indefinite" keyTimes="0.000;0.112;0.487;0.862;1.000" values="5.76;5.76;7.76;5.76;5.76"/>
                </circle>
                <circle cx="93" cy="93" r="8.00" fill="currentColor">
                    <animate attributeName="r" dur="2.00s" repeatCount="indefinite" keyTimes="0.000;0.000;0.375;0.750;1.000" values="8.00;8.00;10.00;8.00;8.00"/>
                </circle>
                <circle cx="120" cy="93" r="5.76" fill="currentColor">
                    <animate attributeName="r" dur="2.00s" repeatCount="indefinite" keyTimes="0.000;0.112;0.487;0.862;1.000" values="5.76;5.76;7.76;5.76;5.76"/>
                </circle>
                <circle cx="146" cy="93" r="3.53" fill="currentColor">
                    <animate attributeName="r" dur="2.00s" repeatCount="indefinite" keyTimes="0.000;0.224;0.599;0.974;1.000" values="3.53;3.53;5.53;3.53;3.53"/>
                </circle>
                <circle cx="40" cy="120" r="3.00" fill="currentColor">
                    <animate attributeName="r" dur="2.00s" repeatCount="indefinite" keyTimes="0.000;0.250;0.625;1.000;1.000" values="3.00;3.00;5.00;3.00;3.00"/>
                </circle>
                <circle cx="66" cy="120" r="4.84" fill="currentColor">
                    <animate attributeName="r" dur="2.00s" repeatCount="indefinite" keyTimes="0.000;0.158;0.533;0.908;1.000" values="4.84;4.84;6.84;4.84;4.84"/>
                </circle>
                <circle cx="93" cy="120" r="5.76" fill="currentColor">
                    <animate attributeName="r" dur="2.00s" repeatCount="indefinite" keyTimes="0.000;0.112;0.487;0.862;1.000" values="5.76;5.76;7.76;5.76;5.76"/>
                </circle>
                <circle cx="120" cy="120" r="4.84" fill="currentColor">
                    <animate attributeName="r" dur="2.00s" repeatCount="indefinite" keyTimes="0.000;0.158;0.533;0.908;1.000" values="4.84;4.84;6.84;4.84;4.84"/>
                </circle>
                <circle cx="146" cy="120" r="3.00" fill="currentColor">
                    <animate attributeName="r" dur="2.00s" repeatCount="indefinite" keyTimes="0.000;0.250;0.625;1.000;1.000" values="3.00;3.00;5.00;3.00;3.00"/>
                </circle>
                <circle cx="66" cy="146" r="3.00" fill="currentColor">
                    <animate attributeName="r" dur="2.00s" repeatCount="indefinite" keyTimes="0.000;0.250;0.625;1.000;1.000" values="3.00;3.00;5.00;3.00;3.00"/>
                </circle>
                <circle cx="93" cy="146" r="3.53" fill="currentColor">
                    <animate attributeName="r" dur="2.00s" repeatCount="indefinite" keyTimes="0.000;0.224;0.599;0.974;1.000" values="3.53;3.53;5.53;3.53;3.53"/>
                </circle>
                <circle cx="120" cy="146" r="3.00" fill="currentColor">
                    <animate attributeName="r" dur="2.00s" repeatCount="indefinite" keyTimes="0.000;0.250;0.625;1.000;1.000" values="3.00;3.00;5.00;3.00;3.00"/>
                </circle>
                </svg>
    )
}
