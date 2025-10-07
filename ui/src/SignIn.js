"use client";

import React from "react";
import {Button, Input, Checkbox, Link, Divider, Form} from "@heroui/react";
import {Icon} from "@iconify/react";
import { useState } from "react";
import { Logo } from "./logo";

export default function Component() {
  const [forgottenPassword, setForgottenPassword] = React.useState(false);
  const [recoverySent, setRecoverySent] = React.useState(false);
  const [isVisible, setIsVisible] = React.useState(false);
  const [errors, setErrors] = useState()
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const redirectTarget = React.useMemo(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    const params = new URLSearchParams(window.location.search);
    const rawValue = params.get("redirect");
    if (!rawValue) {
      return undefined;
    }
    try {
      const parsed = new URL(rawValue, window.location.origin);
      if (parsed.origin !== window.location.origin) {
        return "/";
      }
      const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      if (path.startsWith("/login")) {
        return "/";
      }
      if (!path.startsWith("/")) {
        return "/";
      }
      return path || "/";
    } catch (error) {
      if (rawValue.startsWith("/") && !rawValue.startsWith("//") && !rawValue.startsWith("/login")) {
        return rawValue;
      }
      return "/";
    }
  }, []);
  const googleLoginUrl = React.useMemo(() => {
    if (!redirectTarget) {
      return "/google/login";
    }
    return `/google/login?redirect=${encodeURIComponent(redirectTarget)}`;
  }, [redirectTarget]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const toggleVisibility = () => setIsVisible(!isVisible);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrors()
    if( forgottenPassword ){
      const response = await fetch("/auth/forgot", {
        method: "POST",
        credentials: "include", // so that the session cookie is set
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if( data.message  ){
        setRecoverySent( data.message )
      }
      return
    }
    const response = await fetch("/auth/login", {
      method: "POST",
      credentials: "include", // so that the session cookie is set
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(formData),
    });

    const data = await response.json();
    if( data.user ){
      const target =
        data.redirect ||
        redirectTarget ||
        "/";
      window.location.href = target;
      return
    }
    setErrors("Unrecognized username or incorrect password")
  };

  return (
    <div className="flex min-h-[48rem] w-full items-center justify-center bg-gradient-to-br from-lime-50 via-emerald-300 via-70% to-sky-600 p-2 sm:p-4 lg:p-8">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-large bg-content1 px-8 pb-10 pt-6 shadow-large">
        <div className="flex items-center pt-2 pb-2">
          <Logo className='w-8 h-8 shrink-0 mr-1'/>
          <p className="font-['Poppins'] font-black font-family-[Poppins] text-2xl">SENSE</p>
        </div>
        {recoverySent && (
          <div className="mb-2 rounded-medium bg-success-100 p-3 text-sm text-success-700">
            {recoverySent}
          </div>
        )}
        <Form className="flex flex-col gap-3" validationBehavior="native" onSubmit={handleSubmit}>
          {!recoverySent &&<Input
            isRequired
            label="Email Address"
            name="email"
            placeholder="Enter your email"
            type="email"
            onChange={handleChange}
            variant="bordered"
          />}

          {!forgottenPassword && <Input
            isRequired
            endContent={
              <button type="button" onClick={toggleVisibility}>
                {isVisible ? (
                  <Icon
                    className="pointer-events-none text-2xl text-default-400"
                    icon="solar:eye-closed-linear"
                  />
                ) : (
                  <Icon
                    className="pointer-events-none text-2xl text-default-400"
                    icon="solar:eye-bold"
                  />
                )}
              </button>
            }
            label="Password"
            name="password"
            placeholder="Enter your password"
            onChange={handleChange}
            type={isVisible ? "text" : "password"}
            variant="bordered"
          />}

          <div className="flex w-full items-center justify-between px-1 py-2">
            <Checkbox name="remember" size="sm" className={forgottenPassword ? "invisible" : ""}>
              Remember me
            </Checkbox>
            <Link className="text-default-500" onClick={()=>{setRecoverySent(false);setForgottenPassword(!forgottenPassword)}} size="sm">
              {forgottenPassword ? "Back to login" :"Forgot password?"}
            </Link>
          </div>
            {errors && (
              <p className="mt-1 text-tiny text-danger">{errors}</p>
            )}
          <Button className="w-full" color="primary" type="submit">
            {forgottenPassword ? "Send recovery email" : "Log In"}
          </Button>
        </Form>
        {!forgottenPassword && <>
          <div className="flex items-center gap-4 py-2">
            <Divider className="flex-1" />
            <p className="shrink-0 text-tiny text-default-500">OR</p>
            <Divider className="flex-1" />
          </div>
          <div className="flex flex-col gap-2">
            <Button
              onClick={()=>{window.location.href = googleLoginUrl}} 
              startContent={<Icon icon="flat-color-icons:google" width={24} />}
              variant="bordered"
            >
              Continue with Google
            </Button>
          </div>
          <p className="text-center text-small">
            Need to create an account?&nbsp;
            <Link href="/signup" size="sm">
              Sign Up
            </Link>
          </p>
        </>}
      </div>
    </div>
  );
}
